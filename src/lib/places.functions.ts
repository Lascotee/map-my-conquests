import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AESTHETIC_QUERIES } from "@/lib/aesthetic-queries";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

export type PlaceResult = {
  id: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  rating: number | null;
  reviews: number | null;
  phone: string | null;
  website: string | null;
  matched: string[];
};

type Bounds = { north: number; south: number; east: number; west: number };

type ApiPlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  nationalPhoneNumber?: string;
  websiteUri?: string;
};

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.nationalPhoneNumber",
  "places.websiteUri",
].join(",");

export const searchAestheticPlaces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { bounds: Bounds }) => {
    const b = input?.bounds;
    const nums = [b?.north, b?.south, b?.east, b?.west];
    if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) {
      throw new Error("Área inválida para busca");
    }
    return { bounds: b };
  })
  .handler(async ({ data }): Promise<PlaceResult[]> => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!lovableKey || !mapsKey) throw new Error("Google Maps não está configurado");

    const b = data.bounds;
    const rectangle = {
      low: { latitude: b.south, longitude: b.west },
      high: { latitude: b.north, longitude: b.east },
    };

    const found = new Map<string, PlaceResult>();

    async function runQuery(textQuery: string) {
      const res = await fetch(`${GATEWAY_URL}/places/v1/places:searchText`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": mapsKey!,
          "Content-Type": "application/json",
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify({
          textQuery,
          languageCode: "pt-BR",
          regionCode: "BR",
          maxResultCount: 20,
          locationRestriction: { rectangle },
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        console.error(`Places searchText falhou [${res.status}] "${textQuery}": ${body}`);
        if (res.status === 403 || res.status === 401) {
          throw new Error(`Busca de comércios indisponível (${res.status})`);
        }
        return;
      }

      const json = (await res.json()) as { places?: ApiPlace[] };
      for (const p of json.places ?? []) {
        if (!p.id || !p.location) continue;
        const existing = found.get(p.id);
        if (existing) {
          if (!existing.matched.includes(textQuery)) existing.matched.push(textQuery);
          continue;
        }
        found.set(p.id, {
          id: p.id,
          name: p.displayName?.text ?? "Sem nome",
          address: p.formattedAddress ?? "",
          location: { lat: p.location.latitude, lng: p.location.longitude },
          rating: p.rating ?? null,
          reviews: p.userRatingCount ?? null,
          phone: p.nationalPhoneNumber ?? null,
          website: p.websiteUri ?? null,
          matched: [textQuery],
        });
      }
    }

    const queue = [...AESTHETIC_QUERIES];
    const workers = Array.from({ length: 6 }, async () => {
      for (;;) {
        const next = queue.shift();
        if (!next) return;
        await runQuery(next);
      }
    });
    await Promise.all(workers);

    return [...found.values()].sort(
      (a, b2) => (b2.reviews ?? 0) - (a.reviews ?? 0) || (b2.rating ?? 0) - (a.rating ?? 0),
    );
  });
