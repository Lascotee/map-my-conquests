import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

export type GeocodeResult = {
  name: string;
  bounds: { north: number; south: number; east: number; west: number };
  center: { lat: number; lng: number };
};

export const searchArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { query: string }) => {
    const query = String(input?.query ?? "")
      .trim()
      .slice(0, 200);
    if (query.length < 2) throw new Error("Digite pelo menos 2 caracteres");
    return { query };
  })
  .handler(async ({ data }): Promise<GeocodeResult[]> => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const mapsKey =
      process.env["GOOGLE_MAPS_API_KEY"] ||
      process.env["VITE_GOOGLE_MAPS_API_KEY"] ||
      process.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"] ||
      process.env["GOOGLE_MAPS_BROWSER_KEY"];

    if (!mapsKey && !lovableKey) {
      throw new Error("Chave do Google Maps não está configurada");
    }

    let url: string;
    let headers: Record<string, string> = {};

    if (lovableKey && mapsKey && !mapsKey.startsWith("AIzaSy")) {
      url = `${GATEWAY_URL}/maps/api/geocode/json?language=pt-BR&region=br&address=${encodeURIComponent(data.query)}`;
      headers = {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": mapsKey,
      };
    } else {
      url = `https://maps.googleapis.com/maps/api/geocode/json?language=pt-BR&region=br&address=${encodeURIComponent(data.query)}&key=${mapsKey}`;
    }

    const res = await fetch(url, { headers });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Geocoding falhou [${res.status}]: ${body}`);
      throw new Error(`Busca indisponível no momento (${res.status})`);
    }

    const json = (await res.json()) as {
      status: string;
      results?: Array<{
        formatted_address: string;
        geometry: {
          location: { lat: number; lng: number };
          bounds?: {
            northeast: { lat: number; lng: number };
            southwest: { lat: number; lng: number };
          };
          viewport: {
            northeast: { lat: number; lng: number };
            southwest: { lat: number; lng: number };
          };
        };
      }>;
    };

    if (json.status !== "OK" || !json.results?.length) return [];

    return json.results.slice(0, 5).map((r) => {
      const box = r.geometry.bounds ?? r.geometry.viewport;
      return {
        name: r.formatted_address,
        center: r.geometry.location,
        bounds: {
          north: box.northeast.lat,
          south: box.southwest.lat,
          east: box.northeast.lng,
          west: box.southwest.lng,
        },
      };
    });
  });
