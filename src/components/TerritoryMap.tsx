import { useEffect, useRef } from "react";
import { loadGoogleMaps, STATUS_META, type LatLngLiteral, type Territory } from "@/lib/maps";

const DEFAULT_CENTER: LatLngLiteral = { lat: -27.5954, lng: -48.548 }; // Florianópolis
const VIEW_KEY = "territorios:view";

type Props = {
  territories: Territory[];
  drawing: boolean;
  selectedId: string | null;
  focus: { bounds: { north: number; south: number; east: number; west: number } } | null;
  onPolygonComplete: (path: LatLngLiteral[]) => void;
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
  onPolygonComplete,
  onSelect,
  onPathEdited,
  onDraftChange,
  finishSignal = 0,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const shapesRef = useRef<Map<string, google.maps.Polygon>>(new Map());
  const draftRef = useRef<LatLngLiteral[]>([]);
  const draftShapeRef = useRef<google.maps.Polygon | null>(null);
  const draftMarkersRef = useRef<google.maps.Marker[]>([]);
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  const handlersRef = useRef({ onPolygonComplete, onSelect, onPathEdited, onDraftChange });
  handlersRef.current = { onPolygonComplete, onSelect, onPathEdited, onDraftChange };

  function clearDraft() {
    draftRef.current = [];
    draftShapeRef.current?.setMap(null);
    draftShapeRef.current = null;
    for (const m of draftMarkersRef.current) m.setMap(null);
    draftMarkersRef.current = [];
    handlersRef.current.onDraftChange?.(0);
  }

  function renderDraft() {
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
    handlersRef.current.onDraftChange?.(draftRef.current.length);
  }

  function finishDraft() {
    if (draftRef.current.length < 3) {
      clearDraft();
      return;
    }
    const path = draftRef.current.slice();
    clearDraft();
    handlersRef.current.onPolygonComplete(path);
  }

  useEffect(() => {
    let cancelled = false;
    void loadGoogleMaps().then((maps) => {
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
      });

      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (!drawingRef.current || !e.latLng) return;
        draftRef.current = [...draftRef.current, { lat: e.latLng.lat(), lng: e.latLng.lng() }];
        renderDraft();
      });

      map.addListener("dblclick", () => {
        if (drawingRef.current) finishDraft();
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!drawing) clearDraft();
  }, [drawing]);

  useEffect(() => {
    if (finishSignal > 0) finishDraft();
  }, [finishSignal]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google?.maps?.Polygon) return;
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
        poly.addListener("click", () => handlersRef.current.onSelect(t.id));
        poly.getPath().addListener("set_at", () => {
          handlersRef.current.onPathEdited(
            t.id,
            poly!.getPath().getArray().map((p) => ({ lat: p.lat(), lng: p.lng() })),
          );
        });
        poly.getPath().addListener("insert_at", () => {
          handlersRef.current.onPathEdited(
            t.id,
            poly!.getPath().getArray().map((p) => ({ lat: p.lat(), lng: p.lng() })),
          );
        });
        shapes.set(t.id, poly);
      } else {
        poly.setPath(t.path);
      }
      poly.setOptions({
        fillColor: color,
        strokeColor: color,
        fillOpacity: isSelected ? 0.55 : 0.32,
        strokeWeight: isSelected ? 4 : 2,
        editable: isSelected && !drawing,
        clickable: !drawing,
        zIndex: isSelected ? 10 : 1,
      });
    }

      for (const [id, poly] of shapes) {
        if (!seen.has(id)) {
          poly.setMap(null);
          shapes.delete(id);
        }
      }
    } catch (err) {
      console.error("Falha ao desenhar regiões no mapa", err);
    }
  }, [territories, selectedId, drawing]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus || !window.google) return;
    const b = focus.bounds;
    map.fitBounds(
      new window.google.maps.LatLngBounds(
        { lat: b.south, lng: b.west },
        { lat: b.north, lng: b.east },
      ),
    );
  }, [focus]);

  return <div ref={containerRef} className="h-full w-full" />;
}
