import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { BBox, GeoJSONFeatureCollection } from "@/lib/geodata";

type Props = {
  data: GeoJSONFeatureCollection | null;
  codeProp: string;
  nameProp: string;
  selectedCode: string | null;
  fitBBox: BBox | null;
  onSelect: (code: string, name: string) => void;
  onHover?: (info: { code: string; name: string } | null) => void;
};

const BRAZIL_BBOX: BBox = [-73.99, -33.75, -29.3, 5.27];

export default function BrasilMap({
  data,
  codeProp,
  nameProp,
  selectedCode,
  fitBBox,
  onSelect,
  onHover,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const hoveredRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const handlers = useRef({ onSelect, onHover });
  handlers.current = { onSelect, onHover };
  const pending = useRef<{ data: GeoJSONFeatureCollection | null; codeProp: string }>({
    data: null,
    codeProp,
  });

  function applyData(map: maplibregl.Map, fc: GeoJSONFeatureCollection | null, idProp: string) {
    const empty: GeoJSONFeatureCollection = { type: "FeatureCollection", features: [] };
    // a promoteId não pode mudar: recria a fonte sempre que o nível muda
    const existing = map.getSource("areas");
    if (existing) {
      if (map.getLayer("areas-fill")) map.removeLayer("areas-fill");
      if (map.getLayer("areas-line")) map.removeLayer("areas-line");
      if (map.getLayer("areas-line-selected")) map.removeLayer("areas-line-selected");
      map.removeSource("areas");
    }
    map.addSource("areas", {
      type: "geojson",
      data: (fc ?? empty) as never,
      promoteId: idProp,
    });
    map.addLayer({
      id: "areas-fill",
      type: "fill",
      source: "areas",
      paint: {
        "fill-color": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          "#1f9d6d",
          ["boolean", ["feature-state", "hover"], false],
          "#e0a03d",
          "#7c3aed",
        ],
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          0.55,
          ["boolean", ["feature-state", "hover"], false],
          0.4,
          0.18,
        ],
      },
    });
    map.addLayer({
      id: "areas-line",
      type: "line",
      source: "areas",
      paint: { "line-color": "#334155", "line-width": 0.7, "line-opacity": 0.8 },
    });
    map.addLayer({
      id: "areas-line-selected",
      type: "line",
      source: "areas",
      filter: ["==", ["get", idProp], selectedRef.current ?? "__none__"],
      paint: { "line-color": "#0f172a", "line-width": 2.5 },
    });
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": "#eef2f6" } }],
      },
      bounds: BRAZIL_BBOX,
      fitBoundsOptions: { padding: 24 },
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: "IBGE" }),
      "bottom-right",
    );

    map.on("load", () => {
      readyRef.current = true;
      applyData(map, pending.current.data, pending.current.codeProp);

      map.on("mousemove", "areas-fill", (e: maplibregl.MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        const id = String(f.id ?? "");
        if (hoveredRef.current && hoveredRef.current !== id) {
          map.setFeatureState({ source: "areas", id: hoveredRef.current }, { hover: false });
        }
        hoveredRef.current = id;
        map.setFeatureState({ source: "areas", id }, { hover: true });
        map.getCanvas().style.cursor = "pointer";
        handlers.current.onHover?.({
          code: id,
          name: String(f.properties?.[nameProp] ?? ""),
        });
      });

      map.on("mouseleave", "areas-fill", () => {
        if (hoveredRef.current) {
          map.setFeatureState({ source: "areas", id: hoveredRef.current }, { hover: false });
        }
        hoveredRef.current = null;
        map.getCanvas().style.cursor = "";
        handlers.current.onHover?.(null);
      });

      map.on("click", "areas-fill", (e: maplibregl.MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        handlers.current.onSelect(String(f.id ?? ""), String(f.properties?.[nameProp] ?? ""));
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    pending.current = { data, codeProp };
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    hoveredRef.current = null;
    applyData(map, data, codeProp);
  }, [data, codeProp]);

  useEffect(() => {
    selectedRef.current = selectedCode;
    const map = mapRef.current;
    if (!map || !readyRef.current || !map.getSource("areas")) return;
    map.removeFeatureState({ source: "areas" });
    if (selectedCode) map.setFeatureState({ source: "areas", id: selectedCode }, { selected: true });
    if (map.getLayer("areas-line-selected")) {
      map.setFilter("areas-line-selected", ["==", ["get", codeProp], selectedCode ?? "__none__"]);
    }
  }, [selectedCode, codeProp, data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitBBox) return;
    map.fitBounds(
      [
        [fitBBox[0], fitBBox[1]],
        [fitBBox[2], fitBBox[3]],
      ],
      { padding: 40, duration: 700, maxZoom: 14 },
    );
  }, [fitBBox]);

  return <div ref={containerRef} className="h-full w-full" />;
}
