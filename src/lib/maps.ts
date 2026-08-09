/// <reference types="google.maps" />

let loadPromise: Promise<typeof google.maps> | null = null;

export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps só carrega no navegador"));
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const key = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"];
    const channel = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID"] ?? "";
    if (!key) {
      reject(new Error("Chave do Google Maps indisponível"));
      return;
    }

    const callbackName = "__initTerritorioMaps";
    (window as unknown as Record<string, unknown>)[callbackName] = () => {
      resolve(window.google.maps);
    };

    const script = document.createElement("script");
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${key}` +
      `&loading=async&libraries=drawing,geometry&language=pt-BR&region=BR` +
      `&callback=${callbackName}` +
      (channel ? `&channel=${channel}` : "");
    script.async = true;
    script.onerror = () => reject(new Error("Falha ao carregar o Google Maps"));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export type LatLngLiteral = { lat: number; lng: number };

export const STATUS_META = {
  pendente: { label: "Pendente", color: "#e0533d" },
  andamento: { label: "Em andamento", color: "#e0a03d" },
  concluido: { label: "Concluído", color: "#1f9d6d" },
} as const;

export type TerritoryStatus = keyof typeof STATUS_META;

export type Territory = {
  id: string;
  name: string;
  status: TerritoryStatus;
  notes: string | null;
  path: LatLngLiteral[];
  updated_at: string;
};
