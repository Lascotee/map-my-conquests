/** Carregamento sob demanda das malhas territoriais do IBGE (pacote br-geodata). */

export type GeoFeature = {
  type: "Feature";
  properties: Record<string, string>;
  geometry: { type: string; coordinates: unknown };
};

export type GeoJSONFeatureCollection = {
  type: "FeatureCollection";
  features: GeoFeature[];
};

export type Level =
  | "regioes"
  | "ufs"
  | "regioes_intermediarias"
  | "regioes_imediatas"
  | "municipios"
  | "distritos"
  | "subdistritos"
  | "bairros";

export const LEVEL_META: Record<
  Level,
  { label: string; codeProp: string; nameProp: string; sourceYear: number; perUf: boolean }
> = {
  regioes: {
    label: "Região",
    codeProp: "CD_REGIAO",
    nameProp: "NM_REGIAO",
    sourceYear: 2025,
    perUf: false,
  },
  ufs: { label: "Estado", codeProp: "CD_UF", nameProp: "NM_UF", sourceYear: 2025, perUf: false },
  regioes_intermediarias: {
    label: "Região intermediária",
    codeProp: "CD_RGINT",
    nameProp: "NM_RGINT",
    sourceYear: 2025,
    perUf: false,
  },
  regioes_imediatas: {
    label: "Região imediata",
    codeProp: "CD_RGI",
    nameProp: "NM_RGI",
    sourceYear: 2025,
    perUf: false,
  },
  municipios: {
    label: "Município",
    codeProp: "CD_MUN",
    nameProp: "NM_MUN",
    sourceYear: 2025,
    perUf: true,
  },
  distritos: {
    label: "Distrito",
    codeProp: "CD_DIST",
    nameProp: "NM_DIST",
    sourceYear: 2022,
    perUf: true,
  },
  subdistritos: {
    label: "Subdistrito",
    codeProp: "CD_SUBDIST",
    nameProp: "NM_SUBDIST",
    sourceYear: 2022,
    perUf: true,
  },
  bairros: {
    label: "Bairro",
    codeProp: "CD_BAIRRO",
    nameProp: "NM_BAIRRO",
    sourceYear: 2022,
    perUf: true,
  },
};

export const DATA_SOURCE = "IBGE — malhas territoriais";

/* ---------- índices ---------- */

export type RegiaoIndex = { code: string; name: string; abbr: string; source_year: number };
export type UfIndex = {
  code: string;
  name: string;
  abbr: string;
  region_code: string;
  source_year: number;
};
export type RgIntIndex = {
  code: string;
  name: string;
  uf_code: string;
  region_code: string;
  source_year: number;
};
export type RgiIndex = {
  code: string;
  name: string;
  intermediate_region_code: string;
  uf_code: string;
  source_year: number;
};
export type MunicipioIndex = {
  code: string;
  name: string;
  uf_code: string;
  uf_abbr: string;
  immediate_region_code: string;
  intermediate_region_code: string;
  neighborhood_coverage: string;
  neighborhood_count: number;
  named_subdistrict_count: number;
  source_year: number;
};
export type DistritoIndex = {
  code: string;
  name: string;
  municipality_code: string;
  uf_code: string;
  source_year: number;
};
export type SubdistritoIndex = {
  code: string;
  name: string | null;
  is_named: boolean;
  district_code: string;
  municipality_code: string;
  uf_code: string;
  source_year: number;
};
export type BairroIndex = {
  code: string;
  name: string;
  subdistrict_code: string;
  district_code: string;
  municipality_code: string;
  uf_code: string;
  source_year: number;
};

const indexCache = new Map<string, Promise<unknown>>();

export function loadIndex<T>(name: Level): Promise<T[]> {
  const url = `/geodata/index/${name}.json`;
  let req = indexCache.get(url) as Promise<T[]> | undefined;
  if (!req) {
    req = fetch(url).then(async (res) => {
      if (!res.ok) throw new Error(`Falha ao carregar índice ${name}`);
      return (await res.json()) as T[];
    });
    indexCache.set(url, req);
  }
  return req;
}

export type Manifest = {
  version: string;
  totals: Record<string, number>;
  geometry: Record<string, unknown>;
};

let manifestPromise: Promise<Manifest> | null = null;
export function loadManifest(): Promise<Manifest> {
  manifestPromise ??= fetch("/geodata/manifest.json").then((r) => r.json() as Promise<Manifest>);
  return manifestPromise;
}

/* ---------- geometrias ---------- */

const MAX_CACHED_LAYERS = 4;
const geoCache = new Map<string, Promise<GeoJSONFeatureCollection>>();

async function decompress(response: Response): Promise<string> {
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // servidor pode já ter descomprimido via Content-Encoding
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes);

  if ("DecompressionStream" in globalThis) {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      return await new Response(stream).text();
    } catch {
      /* usa o fallback abaixo */
    }
  }
  const { ungzip } = await import("pako");
  return new TextDecoder().decode(ungzip(bytes));
}

export function geometryUrl(level: Level, ufCode?: string): string {
  return LEVEL_META[level].perUf
    ? `/geodata/data/${level}/${ufCode}.json.gz`
    : `/geodata/data/${level}.json.gz`;
}

export function loadGeometry(level: Level, ufCode?: string): Promise<GeoJSONFeatureCollection> {
  const url = geometryUrl(level, ufCode);
  const cached = geoCache.get(url);
  if (cached) return cached;

  const req = fetch(url, { headers: { Accept: "application/gzip" } })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Falha ao carregar ${url}: HTTP ${res.status}`);
      return JSON.parse(await decompress(res)) as GeoJSONFeatureCollection;
    })
    .catch((err) => {
      geoCache.delete(url);
      throw err;
    });

  geoCache.set(url, req);
  // mantém um cache pequeno: descarta as camadas detalhadas mais antigas
  while (geoCache.size > MAX_CACHED_LAYERS) {
    const oldest = geoCache.keys().next().value as string | undefined;
    if (!oldest || oldest === url) break;
    geoCache.delete(oldest);
  }
  return req;
}

export function clearGeodataCache(): void {
  geoCache.clear();
}

/* ---------- utilidades ---------- */

export type BBox = [number, number, number, number];

function walk(coords: unknown, fn: (lng: number, lat: number) => void) {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    fn(coords[0] as number, coords[1] as number);
    return;
  }
  for (const c of coords) walk(c, fn);
}

export function bboxOf(features: GeoFeature[]): BBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of features) {
    walk(f.geometry?.coordinates, (lng, lat) => {
      if (lng < minX) minX = lng;
      if (lat < minY) minY = lat;
      if (lng > maxX) maxX = lng;
      if (lat > maxY) maxY = lat;
    });
  }
  if (!Number.isFinite(minX)) return null;
  return [minX, minY, maxX, maxY];
}

function ringArea(ring: number[][]): number {
  let area = 0;
  for (let i = 0, previous = ring.length - 1; i < ring.length; previous = i++) {
    const currentPoint = ring[i];
    const previousPoint = ring[previous];
    if (!currentPoint || !previousPoint) continue;
    area +=
      (previousPoint[0] ?? 0) * (currentPoint[1] ?? 0) -
      (currentPoint[0] ?? 0) * (previousPoint[1] ?? 0);
  }
  return Math.abs(area / 2);
}

/** Converte o maior anel externo da feature em caminho lat/lng. */
export function featureToPath(feature: GeoFeature): { lat: number; lng: number }[] {
  const geom = feature.geometry;
  const rings: number[][][] =
    geom.type === "Polygon"
      ? [(geom.coordinates as number[][][])[0] ?? []]
      : (geom.coordinates as number[][][][]).map((poly) => poly[0] ?? []);
  let best: number[][] = [];
  let bestArea = -1;
  for (const ring of rings) {
    const area = ringArea(ring);
    if (area > bestArea) {
      best = ring;
      bestArea = area;
    }
  }
  return best
    .filter((c) => Array.isArray(c) && c.length >= 2)
    .map((c) => ({ lat: c[1]!, lng: c[0]! }));
}

export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
