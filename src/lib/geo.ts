export type LatLng = { lat: number; lng: number };

export type Bounds = { north: number; south: number; east: number; west: number };

export function boundsOf(path: LatLng[]): Bounds {
  return {
    north: Math.max(...path.map((p) => p.lat)),
    south: Math.min(...path.map((p) => p.lat)),
    east: Math.max(...path.map((p) => p.lng)),
    west: Math.min(...path.map((p) => p.lng)),
  };
}

/** Ray casting point-in-polygon test. */
export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const intersects =
      a.lat > point.lat !== b.lat > point.lat &&
      point.lng < ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function rectPath(b: Bounds): LatLng[] {
  return [
    { lat: b.north, lng: b.west },
    { lat: b.north, lng: b.east },
    { lat: b.south, lng: b.east },
    { lat: b.south, lng: b.west },
  ];
}
