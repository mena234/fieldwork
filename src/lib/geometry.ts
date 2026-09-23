import type { GPS, Polygon } from "./types";
export function polygonFromVertices(vertices: number[][]): Polygon {
  return {
    type: "Polygon",
    coordinates: [[...vertices, ...(vertices.length ? [vertices[0]] : [])]],
  };
}
export function validatePolygon(p: Polygon | null): string | null {
  if (!p || p.type !== "Polygon" || p.coordinates.length !== 1)
    return "Draw one boundary with at least 3 vertices.";
  const r = p.coordinates[0];
  if (r.length < 4 || r.length > 501) return "Use 3–500 vertices.";
  if (
    r.some(
      (v) =>
        v.length !== 2 ||
        !Number.isFinite(v[0]) ||
        !Number.isFinite(v[1]) ||
        Math.abs(v[0]) > 180 ||
        Math.abs(v[1]) > 90,
    )
  )
    return "Coordinates must be valid longitude / latitude pairs.";
  if (r[0][0] !== r.at(-1)![0] || r[0][1] !== r.at(-1)![1])
    return "Close the boundary.";
  if (new Set(r.slice(0, -1).map((v) => v.join(","))).size !== r.length - 1)
    return "Remove duplicate vertices.";
  const cross = (a: number[], b: number[], c: number[]) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < r.length - 1; i++)
    for (let j = i + 2; j < r.length - 1; j++) {
      if (i === 0 && j === r.length - 2) continue;
      const a = r[i],
        b = r[i + 1],
        c = r[j],
        d = r[j + 1];
      if (
        cross(a, b, c) * cross(a, b, d) <= 0 &&
        cross(c, d, a) * cross(c, d, b) <= 0 &&
        Math.max(a[0], b[0]) >= Math.min(c[0], d[0]) &&
        Math.max(c[0], d[0]) >= Math.min(a[0], b[0]) &&
        Math.max(a[1], b[1]) >= Math.min(c[1], d[1]) &&
        Math.max(c[1], d[1]) >= Math.min(a[1], b[1])
      )
        return "Boundary edges cross. Move or remove a vertex.";
    }
  if (areaHectares(p) < 0.0001) return "Boundary has no measurable area.";
  return null;
}
export function areaHectares(p: Polygon | null) {
  if (!p) return 0;
  const r = p.coordinates[0];
  let area = 0;
  for (let i = 0; i < r.length - 1; i++) {
    const a = r[i],
      b = r[i + 1];
    area +=
      (((b[0] - a[0]) * Math.PI) / 180) *
      (2 + Math.sin((a[1] * Math.PI) / 180) + Math.sin((b[1] * Math.PI) / 180));
  }
  return Math.abs((area * 6371008.8 ** 2) / 2) / 10000;
}
export function captureGPS(threshold = 20): Promise<GPS> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("GPS is unavailable on this device."));
      return;
    }
    let best: GPS | undefined;
    let watcher: number;
    const finish = () => {
      clearTimeout(timer);
      navigator.geolocation.clearWatch(watcher);
      if (best) resolve(best);
      else
        reject(
          new Error(
            "Could not obtain GPS. Enable location permission and try outdoors.",
          ),
        );
    };
    const timer = setTimeout(finish, 18000);
    watcher = navigator.geolocation.watchPosition(
      (p) => {
        const fix = {
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
          timestamp: new Date(p.timestamp).toISOString(),
        };
        if (!best || fix.accuracy < best.accuracy) best = fix;
        if (fix.accuracy <= threshold) finish();
      },
      (e) => {
        if (e.code === 1) {
          clearTimeout(timer);
          navigator.geolocation.clearWatch(watcher);
          reject(
            new Error(
              "Location permission was denied. Enable it in your browser settings.",
            ),
          );
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 16000 },
    );
  });
}
export function gpsAcceptable(gps: GPS, threshold: number) {
  return gps.accuracy <= threshold || Boolean(gps.override_reason?.trim());
}
