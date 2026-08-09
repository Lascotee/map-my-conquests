import { useEffect, useRef } from "react";
import { loadGoogleMaps, STATUS_META, type LatLngLiteral, type Territory } from "@/lib/maps";

// The bundled @types/google.maps ships an empty DrawingManager stub.
type DrawingManagerLike = {
  setMap: (map: google.maps.Map | null) => void;
  setDrawingMode: (mode: unknown) => void;
  addListener: (event: string, handler: (poly: google.maps.Polygon) => void) => void;
};
type DrawingManagerCtor = new (opts: Record<string, unknown>) => DrawingManagerLike;


type Props = {
  territories: Territory[];
  drawing: boolean;
  selectedId: string | null;
  focus: { bounds: { north: number; south: number; east: number; west: number } } | null;
  onPolygonComplete: (path: LatLngLiteral[]) => void;
  onSelect: (id: string) => void;
  onPathEdited: (id: string, path: LatLngLiteral[]) => void;
};

export default function TerritoryMap({
  territories,
  drawing,
  selectedId,
  focus,
  onPolygonComplete,
  onSelect,
  onPathEdited,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const managerRef = useRef<DrawingManagerLike | null>(null);
  const shapesRef = useRef<Map<string, google.maps.Polygon>>(new Map());
  const handlersRef = useRef({ onPolygonComplete, onSelect, onPathEdited });
  handlersRef.current = { onPolygonComplete, onSelect, onPathEdited };

  useEffect(() => {
    let cancelled = false;
    void loadGoogleMaps().then((maps) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = new maps.Map(containerRef.current, {
        center: { lat: -23.5505, lng: -46.6333 },
        zoom: 13,
        streetViewControl: false,
        mapTypeControl: true,
        fullscreenControl: false,
        clickableIcons: false,
      });
      mapRef.current = map;

      const Manager = maps.drawing.DrawingManager as unknown as DrawingManagerCtor;
      const manager = new Manager({

        drawingMode: null,
        drawingControl: false,
        polygonOptions: {
          fillColor: STATUS_META.pendente.color,
          fillOpacity: 0.3,
          strokeColor: STATUS_META.pendente.color,
          strokeWeight: 2,
        },
      });
      manager.setMap(map);
      managerRef.current = manager;

      manager.addListener("polygoncomplete", (poly: google.maps.Polygon) => {
        const path = poly
          .getPath()
          .getArray()
          .map((p) => ({ lat: p.lat(), lng: p.lng() }));
        poly.setMap(null);
        manager.setDrawingMode(null);
        handlersRef.current.onPolygonComplete(path);
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const manager = managerRef.current;
    if (!manager || !window.google) return;
    manager.setDrawingMode(drawing ? window.google.maps.drawing.OverlayType.POLYGON : null);
  }, [drawing]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    const maps = window.google.maps;
    const shapes = shapesRef.current;
    const seen = new Set<string>();

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
        editable: isSelected,
        zIndex: isSelected ? 10 : 1,
      });
    }

    for (const [id, poly] of shapes) {
      if (!seen.has(id)) {
        poly.setMap(null);
        shapes.delete(id);
      }
    }
  }, [territories, selectedId]);

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
