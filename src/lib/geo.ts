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

function squaredDistanceToSegment(point: LatLng, start: LatLng, end: LatLng): number {
  let x = start.lng;
  let y = start.lat;
  let dx = end.lng - x;
  let dy = end.lat - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((point.lng - x) * dx + (point.lat - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = end.lng;
      y = end.lat;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = point.lng - x;
  dy = point.lat - y;
  return dx * dx + dy * dy;
}

function simplifyDouglasPeucker(path: LatLng[], squaredTolerance: number): LatLng[] {
  if (path.length <= 2) return path;
  const keep = new Uint8Array(path.length);
  keep[0] = 1;
  keep[path.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, path.length - 1]];

  while (stack.length) {
    const [first, last] = stack.pop()!;
    const start = path[first];
    const end = path[last];
    if (!start || !end) continue;

    let farthestIndex = -1;
    let farthestDistance = squaredTolerance;
    for (let index = first + 1; index < last; index += 1) {
      const point = path[index];
      if (!point) continue;
      const distance = squaredDistanceToSegment(point, start, end);
      if (distance > farthestDistance) {
        farthestIndex = index;
        farthestDistance = distance;
      }
    }

    if (farthestIndex > 0) {
      keep[farthestIndex] = 1;
      stack.push([first, farthestIndex], [farthestIndex, last]);
    }
  }

  return path.filter((_, index) => keep[index] === 1);
}

/** Simplifica contornos grandes sem sobrecarregar o mapa, o banco ou as funções do servidor. */
export function simplifyPath(
  path: LatLng[],
  initialTolerance = 0.00005,
  maxPoints = 2500,
): LatLng[] {
  if (path.length <= 3) return path;
  const last = path[path.length - 1];
  const first = path[0];
  const openPath =
    first && last && first.lat === last.lat && first.lng === last.lng ? path.slice(0, -1) : path;
  if (openPath.length <= maxPoints) return openPath;

  let tolerance = initialTolerance;
  let simplified = openPath;
  for (let attempt = 0; attempt < 8 && simplified.length > maxPoints; attempt += 1) {
    simplified = simplifyDouglasPeucker(openPath, tolerance * tolerance);
    tolerance *= 2;
  }

  if (simplified.length <= maxPoints) return simplified;
  const step = Math.ceil(simplified.length / maxPoints);
  return simplified.filter((_, index) => index % step === 0);
}
