import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AESTHETIC_QUERIES } from "@/lib/aesthetic-queries";
import { boundsOf, pointInPolygon, type LatLng } from "@/lib/geo";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

export type PlaceResult = {
  id: string;
  name: string;
  address: string;
  city: string;
  location: { lat: number; lng: number };
  rating: number | null;
  reviews: number | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  matched: string[];
};

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

function cityFromAddress(address: string): string {
  const parts = address.split(",").map((p) => p.trim());
  for (const part of parts) {
    const m = /^(.*?)\s*-\s*[A-Z]{2}$/.exec(part);
    if (m?.[1]) return m[1];
  }
  return parts[parts.length - 3] ?? "";
}

export const searchAestheticPlaces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { polygon: LatLng[]; categories?: string[]; areaName?: string }) => {
    const polygon = Array.isArray(input?.polygon) ? input.polygon : [];
    const valid = polygon.every(
      (p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng),
    );
    if (polygon.length < 3 || !valid) throw new Error("Área inválida para busca");
    const categories = (input.categories ?? [])
      .map((c) => String(c).trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 40);
    return {
      polygon,
      categories,
      areaName: String(input.areaName ?? "").slice(0, 120),
    };
  })
  .handler(async ({ data, context }): Promise<PlaceResult[]> => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!lovableKey || !mapsKey) throw new Error("Google Maps não está configurado");

    const b = boundsOf(data.polygon);
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
        const loc = { lat: p.location.latitude, lng: p.location.longitude };
        if (!pointInPolygon(loc, data.polygon)) continue;
        const existing = found.get(p.id);
        if (existing) {
          if (!existing.matched.includes(textQuery)) existing.matched.push(textQuery);
          continue;
        }
        const address = p.formattedAddress ?? "";
        const website = p.websiteUri ?? null;
        found.set(p.id, {
          id: p.id,
          name: p.displayName?.text ?? "Sem nome",
          address,
          city: cityFromAddress(address),
          location: loc,
          rating: p.rating ?? null,
          reviews: p.userRatingCount ?? null,
          phone: p.nationalPhoneNumber ?? null,
          website: website && website.includes("instagram.com") ? null : website,
          instagram: website && website.includes("instagram.com") ? website : null,
          matched: [textQuery],
        });
      }
    }

    const queue = data.categories.length ? [...data.categories] : [...AESTHETIC_QUERIES];
    const workers = Array.from({ length: 6 }, async () => {
      for (;;) {
        const next = queue.shift();
        if (!next) return;
        await runQuery(next);
      }
    });
    await Promise.all(workers);

    const results = [...found.values()].sort(
      (a, b2) => (b2.reviews ?? 0) - (a.reviews ?? 0) || (b2.rating ?? 0) - (a.rating ?? 0),
    );

    if (results.length) {
      const { data: existing } = await context.supabase
        .from("leads")
        .select("place_id, status")
        .in("place_id", results.map((r) => r.id));
      const statusById = new Map((existing ?? []).map((l) => [l.place_id, l.status]));
      const { error } = await context.supabase.from("leads").upsert(
        results.map((r) => ({
          user_id: context.userId,
          place_id: r.id,
          name: r.name,
          address: r.address,
          city: r.city,
          phone: r.phone,
          website: r.website,
          instagram: r.instagram,
          rating: r.rating,
          reviews: r.reviews,
          lat: r.location.lat,
          lng: r.location.lng,
          categories: r.matched,
          area_name: data.areaName,
          status: statusById.get(r.id) ?? "pendente",
        })),
        { onConflict: "user_id,place_id", ignoreDuplicates: false },
      );
      if (error) console.error("Falha ao salvar leads", error);
    }

    return results;
  });
