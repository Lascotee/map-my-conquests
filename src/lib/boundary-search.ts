import { boundsOf, simplifyPath, type Bounds, type LatLng } from "@/lib/geo";
import {
  featureToPath,
  loadGeometry,
  loadIndex,
  normalize,
  type BairroIndex,
  type Level,
  type MunicipioIndex,
} from "@/lib/geodata";

export type BoundaryCandidate = {
  id: string;
  name: string;
  shortName: string;
  type: "bairro" | "município" | "aproximado";
  exact: boolean;
  source: "IBGE" | "Google Maps";
  level?: Extract<Level, "bairros" | "municipios">;
  code?: string;
  ufCode?: string;
  path?: LatLng[];
  bounds?: Bounds;
};

export type BoundaryResult = BoundaryCandidate & {
  path: LatLng[];
  bounds: Bounds;
};

type SearchData = {
  neighborhoods: BairroIndex[];
  municipalities: MunicipioIndex[];
  municipalityByCode: Map<string, MunicipioIndex>;
};

let searchDataPromise: Promise<SearchData> | null = null;

function loadSearchData(): Promise<SearchData> {
  searchDataPromise ??= Promise.all([
    loadIndex<BairroIndex>("bairros"),
    loadIndex<MunicipioIndex>("municipios"),
  ]).then(([neighborhoods, municipalities]) => ({
    neighborhoods,
    municipalities,
    municipalityByCode: new Map(municipalities.map((item) => [item.code, item])),
  }));
  return searchDataPromise;
}

function score(query: string, tokens: string[], name: string, label: string): number {
  const normalizedName = normalize(name);
  const normalizedLabel = normalize(label);
  if (!tokens.every((token) => normalizedLabel.includes(token))) return -1;

  let value = 20;
  if (normalizedName === query) value += 100;
  else if (normalizedName.startsWith(query)) value += 70;
  else if (normalizedName.includes(query)) value += 45;
  if (normalizedLabel.startsWith(query)) value += 20;
  value -= Math.min(normalizedLabel.length / 20, 10);
  return value;
}

/** Busca bairros e municípios no pacote oficial do IBGE publicado com a aplicação. */
export async function searchIBGEBoundaries(rawQuery: string): Promise<BoundaryCandidate[]> {
  const query = normalize(rawQuery);
  const tokens = query.split(/\s+/).filter((token) => token.length >= 2);
  if (query.length < 2 || tokens.length === 0) return [];

  const data = await loadSearchData();
  const ranked: Array<{ candidate: BoundaryCandidate; score: number }> = [];

  for (const municipality of data.municipalities) {
    const label = `${municipality.name}, ${municipality.uf_abbr}`;
    const value = score(query, tokens, municipality.name, label);
    if (value < 0) continue;
    ranked.push({
      score: value + 5,
      candidate: {
        id: `municipios:${municipality.code}`,
        name: label,
        shortName: municipality.name,
        type: "município",
        exact: true,
        source: "IBGE",
        level: "municipios",
        code: municipality.code,
        ufCode: municipality.uf_code,
      },
    });
  }

  for (const neighborhood of data.neighborhoods) {
    const municipality = data.municipalityByCode.get(neighborhood.municipality_code);
    if (!municipality) continue;
    const normalizedName = normalize(neighborhood.name);
    if (!tokens.some((token) => normalizedName.includes(token))) continue;

    const label = `${neighborhood.name}, ${municipality.name} - ${municipality.uf_abbr}`;
    const value = score(query, tokens, neighborhood.name, label);
    if (value < 0) continue;
    ranked.push({
      score: value + 10,
      candidate: {
        id: `bairros:${neighborhood.code}`,
        name: label,
        shortName: neighborhood.name,
        type: "bairro",
        exact: true,
        source: "IBGE",
        level: "bairros",
        code: neighborhood.code,
        ufCode: neighborhood.uf_code,
      },
    });
  }

  return ranked
    .sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name, "pt-BR"))
    .slice(0, 8)
    .map(({ candidate }) => candidate);
}

export async function loadIBGEBoundary(candidate: BoundaryCandidate): Promise<BoundaryResult> {
  if (candidate.path && candidate.bounds) return candidate as BoundaryResult;
  if (!candidate.level || !candidate.code || !candidate.ufCode) {
    throw new Error("Contorno territorial inválido");
  }

  const collection = await loadGeometry(candidate.level, candidate.ufCode);
  const codeProperty = candidate.level === "bairros" ? "CD_BAIRRO" : "CD_MUN";
  const feature = collection.features.find(
    (item) => String(item.properties[codeProperty] ?? "") === candidate.code,
  );
  if (!feature) throw new Error("O contorno oficial desta região não foi encontrado");

  const path = simplifyPath(
    featureToPath(feature),
    candidate.level === "bairros" ? 0.00003 : 0.0001,
  );
  if (path.length < 3) throw new Error("O contorno desta região é inválido");
  return { ...candidate, path, bounds: boundsOf(path) };
}
