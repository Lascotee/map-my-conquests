import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { boundsOf, type Bounds, type LatLng } from "@/lib/geo";

export type BoundaryResult = {
  name: string;
  shortName: string;
  type: string;
  path: LatLng[];
  bounds: Bounds;
  exact: boolean;
};

type NominatimItem = {
  display_name?: string;
  name?: string;
  type?: string;
  addresstype?: string;
  boundingbox?: [string, string, string, string];
  geojson?: { type: string; coordinates: unknown };
};

function ringToPath(ring: number[][]): LatLng[] {
  return ring
    .filter((c) => Array.isArray(c) && c.length >= 2)
    .map((c) => ({ lat: c[1]!, lng: c[0]! }));
}

function largestRing(geojson: NominatimItem["geojson"]): LatLng[] | null {
  if (!geojson) return null;
  if (geojson.type === "Polygon") {
    const rings = geojson.coordinates as number[][][];
    return rings[0] ? ringToPath(rings[0]) : null;
  }
  if (geojson.type === "MultiPolygon") {
    const polys = geojson.coordinates as number[][][][];
    let best: LatLng[] | null = null;
    for (const poly of polys) {
      const path = poly[0] ? ringToPath(poly[0]) : null;
      if (path && (!best || path.length > best.length)) best = path;
    }
    return best;
  }
  return null;
}

/** Busca o contorno exato de um bairro/cidade (OpenStreetMap). */
export const searchBoundary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { query: string }) => {
    const query = String(input?.query ?? "").trim().slice(0, 200);
    if (query.length < 2) throw new Error("Digite pelo menos 2 caracteres");
    return { query };
  })
  .handler(async ({ data }): Promise<BoundaryResult[]> => {
    const url =
      "https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&limit=6" +
      `&accept-language=pt-BR&countrycodes=br&q=${encodeURIComponent(data.query)}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "lovable-territorios/1.0 (mapeamento de regioes)",
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      console.error(`Nominatim falhou [${res.status}]: ${await res.text()}`);
      return [];
    }

    const items = (await res.json()) as NominatimItem[];
    const out: BoundaryResult[] = [];

    for (const item of items) {
      const path = largestRing(item.geojson);
      const bb = item.boundingbox;
      const fallbackBounds: Bounds | null = bb
        ? { south: Number(bb[0]), north: Number(bb[1]), west: Number(bb[2]), east: Number(bb[3]) }
        : null;
      if (!path && !fallbackBounds) continue;

      const bounds = path ? boundsOf(path) : fallbackBounds!;
      const finalPath =
        path ??
        [
          { lat: bounds.north, lng: bounds.west },
          { lat: bounds.north, lng: bounds.east },
          { lat: bounds.south, lng: bounds.east },
          { lat: bounds.south, lng: bounds.west },
        ];
      const name = item.display_name ?? item.name ?? data.query;
      out.push({
        name,
        shortName: item.name ?? name.split(",")[0] ?? name,
        type: item.addresstype ?? item.type ?? "",
        path: finalPath,
        bounds,
        exact: Boolean(path),
      });
    }

    return out;
  });
