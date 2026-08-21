import { useCallback, useEffect, useRef, useState } from "react";
import { loadGoogleMaps, STATUS_META, type LatLngLiteral, type Territory } from "@/lib/maps";
import type { PlaceResult } from "@/lib/places.functions";

const DEFAULT_CENTER: LatLngLiteral = { lat: -27.5954, lng: -48.548 }; // Florianópolis
const VIEW_KEY = "territorios:view";
const PLACE_COLOR = "#7c3aed";

type Props = {
  territories: Territory[];
  drawing: boolean;
  selectedId: string | null;
  focus: { bounds: { north: number; south: number; east: number; west: number } } | null;
  preview?: LatLngLiteral[] | null;
  places?: PlaceResult[];
  selectedPlaceId?: string | null;
  onSelectPlace?: (id: string) => void;
  onPolygonComplete: (path: LatLngLiteral[]) => void;
  onCancelDrawing?: () => void;
  onSelect: (id: string) => void;
  onPathEdited: (id: string, path: LatLngLiteral[]) => void;
  onDraftChange?: (points: number) => void;
  finishSignal?: number;
};

export default function TerritoryMap({
  territories,
  drawing,
  selectedId,
  focus,
  preview = null,
  places = [],
  selectedPlaceId = null,
  onSelectPlace,
  onPolygonComplete,
  onCancelDrawing,
  onSelect,
  onPathEdited,
  onDraftChange,
  finishSignal = 0,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const shapesRef = useRef<Map<string, google.maps.Polygon>>(new Map());
  const shapeClickListenersRef = useRef<Map<string, google.maps.MapsEventListener>>(new Map());
  const pathListenersRef = useRef<Map<string, google.maps.MapsEventListener[]>>(new Map());
  const editTimersRef = useRef<Map<string, number>>(new Map());
  const placeMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [draftPointCount, setDraftPointCount] = useState(0);

  const previewRef = useRef<google.maps.Polygon | null>(null);
  const draftRef = useRef<LatLngLiteral[]>([]);
  const draftShapeRef = useRef<google.maps.Polygon | null>(null);
  const draftMarkersRef = useRef<google.maps.Marker[]>([]);
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  const handlersRef = useRef({
    onPolygonComplete,
    onSelect,
    onPathEdited,
    onDraftChange,
    onSelectPlace,
  });
  handlersRef.current = { onPolygonComplete, onSelect, onPathEdited, onDraftChange, onSelectPlace };

  const clearDraft = useCallback(() => {
    draftRef.current = [];
    draftShapeRef.current?.setMap(null);
    draftShapeRef.current = null;
    for (const m of draftMarkersRef.current) m.setMap(null);
    draftMarkersRef.current = [];
    setDraftPointCount(0);
    handlersRef.current.onDraftChange?.(0);
  }, []);

  const renderDraft = useCallback(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    const maps = window.google.maps;
    const color = STATUS_META.pendente.color;
    if (!draftShapeRef.current) {
      draftShapeRef.current = new maps.Polygon({
        map,
        fillColor: color,
        strokeColor: color,
        fillOpacity: 0.25,
        strokeWeight: 2,
        clickable: false,
        zIndex: 20,
      });
    }
    draftShapeRef.current.setPath(draftRef.current);

    for (const m of draftMarkersRef.current) m.setMap(null);
    draftMarkersRef.current = draftRef.current.map(
      (p) =>
        new maps.Marker({
          position: p,
          map,
          clickable: false,
          icon: {
            path: maps.SymbolPath.CIRCLE,
            scale: 5,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        }),
    );
    setDraftPointCount(draftRef.current.length);
    handlersRef.current.onDraftChange?.(draftRef.current.length);
  }, []);

  const finishDraft = useCallback(() => {
    if (draftRef.current.length < 3) {
      clearDraft();
      return;
    }
    const path = draftRef.current.slice();
    clearDraft();
    handlersRef.current.onPolygonComplete(path);
  }, [clearDraft]);

  const cancelEditTimer = useCallback((id: string) => {
    const timer = editTimersRef.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    editTimersRef.current.delete(id);
  }, []);

  const detachPathListeners = useCallback((id: string) => {
    for (const listener of pathListenersRef.current.get(id) ?? []) listener.remove();
    pathListenersRef.current.delete(id);
  }, []);

  const bindPathListeners = useCallback(
    (id: string, polygon: google.maps.Polygon) => {
      const persistPath = () => {
        cancelEditTimer(id);
        const timer = window.setTimeout(() => {
          editTimersRef.current.delete(id);
          handlersRef.current.onPathEdited(
            id,
            polygon
              .getPath()
              .getArray()
              .map((point) => ({ lat: point.lat(), lng: point.lng() })),
          );
        }, 250);
        editTimersRef.current.set(id, timer);
      };

      const path = polygon.getPath();
      pathListenersRef.current.set(id, [
        path.addListener("set_at", persistPath),
        path.addListener("insert_at", persistPath),
        path.addListener("remove_at", persistPath),
      ]);
    },
    [cancelEditTimer],
  );

  useEffect(() => {
    let cancelled = false;
    const mapListeners: google.maps.MapsEventListener[] = [];
    const shapeClickListeners = shapeClickListenersRef.current;
    const pathListeners = pathListenersRef.current;
    const editTimers = editTimersRef.current;
    const shapes = shapesRef.current;
    const placeMarkers = placeMarkersRef.current;
    void loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current || mapRef.current) return;

        let center = DEFAULT_CENTER;
        let zoom = 13;
        try {
          const saved = window.localStorage.getItem(VIEW_KEY);
          if (saved) {
            const v = JSON.parse(saved) as { lat: number; lng: number; zoom: number };
            if (Number.isFinite(v.lat) && Number.isFinite(v.lng)) {
              center = { lat: v.lat, lng: v.lng };
              zoom = v.zoom ?? 13;
            }
          }
        } catch {
          /* ignore */
        }

        const map = new maps.Map(containerRef.current, {
          center,
          zoom,
          streetViewControl: false,
          mapTypeControl: true,
          fullscreenControl: false,
          clickableIcons: false,
          disableDoubleClickZoom: true,
        });
        mapRef.current = map;

        mapListeners.push(
          map.addListener("idle", () => {
            const c = map.getCenter();
            if (!c) return;
            try {
              window.localStorage.setItem(
                VIEW_KEY,
                JSON.stringify({ lat: c.lat(), lng: c.lng(), zoom: map.getZoom() ?? 13 }),
              );
            } catch {
              /* ignore */
            }
          }),
        );

        mapListeners.push(
          map.addListener("click", (e: google.maps.MapMouseEvent) => {
            if (!drawingRef.current || !e.latLng) return;
            draftRef.current = [...draftRef.current, { lat: e.latLng.lat(), lng: e.latLng.lng() }];
            renderDraft();
          }),
        );

        mapListeners.push(
          map.addListener("dblclick", () => {
            if (drawingRef.current) finishDraft();
          }),
        );
        setMapError(null);
        setMapReady(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMapError(error instanceof Error ? error.message : "Não foi possível carregar o mapa");
        }
      });

    return () => {
      cancelled = true;
      for (const listener of mapListeners) listener.remove();
      for (const listener of shapeClickListeners.values()) listener.remove();
      for (const listeners of pathListeners.values()) {
        for (const listener of listeners) listener.remove();
      }
      for (const timer of editTimers.values()) window.clearTimeout(timer);
      for (const polygon of shapes.values()) polygon.setMap(null);
      for (const marker of placeMarkers.values()) marker.setMap(null);
      previewRef.current?.setMap(null);
      clearDraft();
      shapeClickListeners.clear();
      pathListeners.clear();
      editTimers.clear();
      shapes.clear();
      placeMarkers.clear();
      mapRef.current = null;
    };
  }, [clearDraft, finishDraft, renderDraft]);

  useEffect(() => {
    if (!drawing) clearDraft();
  }, [clearDraft, drawing]);

  useEffect(() => {
    if (finishSignal > 0) finishDraft();
  }, [finishDraft, finishSignal]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !window.google?.maps?.Polygon) return;
    const maps = window.google.maps;
    const shapes = shapesRef.current;
    const seen = new Set<string>();
    try {
      for (const t of territories) {
        seen.add(t.id);
        const color = STATUS_META[t.status].color;
        const isSelected = t.id === selectedId;
        let poly = shapes.get(t.id);
        if (!poly) {
          poly = new maps.Polygon({ paths: t.path, map });
          shapeClickListenersRef.current.set(
            t.id,
            poly.addListener("click", () => handlersRef.current.onSelect(t.id)),
          );
          bindPathListeners(t.id, poly);
          shapes.set(t.id, poly);
        } else {
          detachPathListeners(t.id);
          cancelEditTimer(t.id);
          poly.setPath(t.path);
          bindPathListeners(t.id, poly);
        }
        poly.setOptions({
          fillColor: color,
          strokeColor: color,
          fillOpacity: isSelected ? 0.55 : 0.32,
          strokeWeight: isSelected ? 4 : 2,
          editable: isSelected && !drawing && t.owned !== false,
          clickable: !drawing,
          zIndex: isSelected ? 10 : 1,
        });
      }

      for (const [id, poly] of shapes) {
        if (!seen.has(id)) {
          poly.setMap(null);
          shapeClickListenersRef.current.get(id)?.remove();
          shapeClickListenersRef.current.delete(id);
          detachPathListeners(id);
          cancelEditTimer(id);
          shapes.delete(id);
        }
      }
    } catch (err) {
      console.error("Falha ao desenhar regiões no mapa", err);
    }
  }, [
    bindPathListeners,
    cancelEditTimer,
    detachPathListeners,
    drawing,
    mapReady,
    selectedId,
    territories,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !window.google?.maps?.Marker) return;
    const maps = window.google.maps;
    const markers = placeMarkersRef.current;
    const seen = new Set<string>();

    for (const p of places) {
      seen.add(p.id);
      let marker = markers.get(p.id);
      if (!marker) {
        marker = new maps.Marker({
          position: p.location,
          map,
          title: p.name,
        });
        marker.addListener("click", () => handlersRef.current.onSelectPlace?.(p.id));
        markers.set(p.id, marker);
      }
      const isSel = p.id === selectedPlaceId;
      marker.setIcon({
        path: maps.SymbolPath.CIRCLE,
        scale: isSel ? 9 : 6,
        fillColor: PLACE_COLOR,
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
      });
      marker.setZIndex(isSel ? 100 : 50);
    }

    for (const [id, marker] of markers) {
      if (!seen.has(id)) {
        marker.setMap(null);
        markers.delete(id);
      }
    }
  }, [mapReady, places, selectedPlaceId]);

  // Ao selecionar um comércio, apenas centraliza o mapa: os detalhes aparecem
  // num painel próprio da aplicação (sem InfoWindow do Google).
  useEffect(() => {
    const map = mapRef.current;
    const place = places.find((p) => p.id === selectedPlaceId);
    if (!mapReady || !map || !place) return;
    map.panTo(place.location);
  }, [mapReady, places, selectedPlaceId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !window.google?.maps?.Polygon) return;
    if (!preview || preview.length < 3) {
      previewRef.current?.setMap(null);
      previewRef.current = null;
      return;
    }
    if (!previewRef.current) {
      previewRef.current = new window.google.maps.Polygon({
        map,
        clickable: false,
        strokeColor: "#e0533d",
        strokeOpacity: 0.95,
        strokeWeight: 3,
        fillColor: "#e0533d",
        fillOpacity: 0.08,
        zIndex: 30,
      });
    }
    previewRef.current.setPath(preview);
  }, [mapReady, preview]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !focus || !window.google) return;
    const b = focus.bounds;
    map.fitBounds(
      new window.google.maps.LatLngBounds(
        { lat: b.south, lng: b.west },
        { lat: b.north, lng: b.east },
      ),
    );
  }, [focus, mapReady]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className={`h-full w-full ${drawing ? "cursor-crosshair" : ""}`} />
      {drawing && (
        <div className="absolute left-1/2 top-4 z-20 w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 rounded-2xl border border-amber-400/40 bg-zinc-950/95 p-3 text-white shadow-2xl backdrop-blur-xl">
          <p className="text-center text-sm font-bold text-amber-300">
            Clique no mapa para marcar os cantos da área
          </p>
          <p className="mt-1 text-center text-xs text-zinc-300">
            {draftPointCount < 3
              ? `Adicione pelo menos 3 pontos (${draftPointCount}/3)`
              : `${draftPointCount} pontos adicionados. A área já pode ser concluída.`}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-white/10"
              onClick={onCancelDrawing}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={draftPointCount < 3}
              className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={finishDraft}
            >
              Concluir e salvar área
            </button>
          </div>
        </div>
      )}
      {mapError && (
        <div className="absolute inset-0 grid place-items-center bg-background/90 p-6 text-center">
          <div>
            <p className="font-semibold">Não foi possível carregar o mapa</p>
            <p className="mt-2 text-sm text-muted-foreground">{mapError}</p>
          </div>
        </div>
      )}
    </div>
  );
}
