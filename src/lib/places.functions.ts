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
  types?: string[];
  primaryTypeDisplayName?: { text?: string };
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
  "places.types",
  "places.primaryTypeDisplayName",
].join(",");

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Sinônimos PT-BR -> tipos do Google Places. */
const TYPE_HINTS: Record<string, string[]> = {
  dentista: ["dentist", "dental"],
  odontolog: ["dentist", "dental"],
  farmacia: ["pharmacy", "drugstore"],
  restaurante: ["restaurant"],
  lanchonete: ["restaurant", "meal"],
  cafeteria: ["cafe", "coffee"],
  academia: ["gym", "fitness"],
  barbearia: ["barber"],
  cabeleireiro: ["hair"],
  salao: ["beauty_salon", "hair"],
  estetica: ["beauty", "spa", "skin"],
  spa: ["spa"],
  clinica: ["doctor", "clinic", "medical", "hospital"],
  medic: ["doctor", "medical"],
  veterinar: ["veterinary"],
  petshop: ["pet_store"],
  tatuagem: ["tattoo"],
  advogad: ["lawyer"],
  imobiliaria: ["real_estate"],
  otica: ["optician"],
  nutricion: ["nutrition", "doctor"],
  fisioterap: ["physiotherapist"],
  psicolog: ["psychologist", "doctor"],
};

/** Mantém apenas comércios que combinam com a categoria pesquisada. */
function matchesCategory(place: ApiPlace, category: string): boolean {
  const terms = normalize(category)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);
  if (terms.length === 0) return true;

  const haystack = normalize(
    [
      place.displayName?.text ?? "",
      place.primaryTypeDisplayName?.text ?? "",
      (place.types ?? []).join(" "),
    ].join(" "),
  );

  return terms.some((term) => {
    if (haystack.includes(term)) return true;
    const stem = term.slice(0, 6);
    for (const [key, hints] of Object.entries(TYPE_HINTS)) {
      if (!term.startsWith(key.slice(0, 6)) && !key.startsWith(stem)) continue;
      if (hints.some((h) => haystack.includes(h))) return true;
    }
    return false;
  });
}

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
  .validator((input: { polygon: LatLng[]; categories?: string[]; areaName?: string }) => {
    const polygon = Array.isArray(input?.polygon) ? input.polygon : [];
    const valid = polygon.every((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng));
    if (polygon.length < 3 || !valid) throw new Error("Área inválida para busca");
    if (polygon.length > 3000) throw new Error("Esta área é detalhada demais para a busca");
    const categories = [
      ...new Set(
        (input.categories ?? [])
          .map((category) => String(category).trim().slice(0, 80))
          .filter(Boolean),
      ),
    ].slice(0, 8);
    return {
      polygon,
      categories,
      areaName: String(input.areaName ?? "").slice(0, 120),
    };
  })
  .handler(async ({ data, context }): Promise<PlaceResult[]> => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const mapsKey =
      process.env["GOOGLE_MAPS_API_KEY"] ||
      process.env["VITE_GOOGLE_MAPS_API_KEY"] ||
      process.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"] ||
      process.env["GOOGLE_MAPS_BROWSER_KEY"];

    if (!mapsKey && !lovableKey) {
      throw new Error("Chave do Google Maps não está configurada");
    }

    const b = boundsOf(data.polygon);
    const rectangle = {
      low: { latitude: b.south, longitude: b.west },
      high: { latitude: b.north, longitude: b.east },
    };

    const found = new Map<string, PlaceResult>();

    async function runQuery(textQuery: string) {
      let url = "https://places.googleapis.com/v1/places:searchText";
      let headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Goog-FieldMask": FIELD_MASK,
        "X-Goog-Api-Key": mapsKey || "",
      };

      if (lovableKey && mapsKey && !mapsKey.startsWith("AIzaSy")) {
        url = `${GATEWAY_URL}/places/v1/places:searchText`;
        headers = {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": mapsKey,
          "Content-Type": "application/json",
          "X-Goog-FieldMask": FIELD_MASK,
        };
      }

      const res = await fetch(url, {
        method: "POST",
        headers,
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
        if (!matchesCategory(p, textQuery)) continue;
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
    const workers = Array.from({ length: 2 }, async () => {
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
        .in(
          "place_id",
          results.map((r) => r.id),
        );
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
