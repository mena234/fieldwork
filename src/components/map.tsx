"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { LocateFixed, MapPin, Minus, Plus, Undo2, WifiOff } from "lucide-react";
import { Button } from "./ui/button";
import type { Farmer, GPS, Polygon } from "@/lib/types";
import {
  areaHectares,
  captureGPS,
  gpsAcceptable,
  polygonFromVertices,
  validatePolygon,
} from "@/lib/geometry";
import { errorMessage } from "@/lib/utils";
export function FieldMap({
  farmers = [],
  polygon,
  vertices,
  onVertices,
  online = true,
  compact = false,
}: {
  farmers?: Farmer[];
  polygon?: Polygon | null;
  vertices?: number[][];
  onVertices?: (v: number[][]) => void;
  online?: boolean;
  compact?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null),
    map = useRef<maplibregl.Map | null>(null),
    markers = useRef<maplibregl.Marker[]>([]);
  const [failed, setFailed] = useState(false),
    [mapLoaded, setMapLoaded] = useState(false),
    [tilesFailed, setTilesFailed] = useState(false);
  const latest = useRef({ vertices, onVertices });
  latest.current = { vertices, onVertices };
  useEffect(() => {
    if (!el.current) return;
    setFailed(false);
    setMapLoaded(false);
    setTilesFailed(false);
    let instance: maplibregl.Map;
    try {
      const satellite = process.env.NEXT_PUBLIC_SATELLITE_TILE_URL;
      instance = new maplibregl.Map({
        container: el.current,
        style: {
          version: 8,
          sources: online
            ? {
                basemap: {
                  type: "raster",
                  tiles: [
                    satellite ||
                      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                  ],
                  tileSize: 256,
                  attribution: satellite
                    ? process.env.NEXT_PUBLIC_SATELLITE_ATTRIBUTION ||
                      "Configured imagery provider"
                    : "© OpenStreetMap contributors",
                },
              }
            : {},
          layers: online
            ? [{ id: "basemap", type: "raster", source: "basemap" }]
            : [
                {
                  id: "background",
                  type: "background",
                  paint: { "background-color": "#edf1e9" },
                },
              ],
        },
        center: [77.065, 23.205],
        zoom: compact ? 11 : 14,
        attributionControl: { compact: true },
      });
      map.current = instance;
      instance.on("style.load", () => setMapLoaded(true));
      instance.on("error", () => setTilesFailed(true));
      instance.on("click", (e) => {
        const { vertices, onVertices } = latest.current;
        if (onVertices)
          onVertices([
            ...(vertices ?? []),
            [Number(e.lngLat.lng.toFixed(7)), Number(e.lngLat.lat.toFixed(7))],
          ]);
      });
    } catch {
      setFailed(true);
      return;
    }
    return () => {
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      instance.remove();
      map.current = null;
    };
  }, [online, compact]);
  useEffect(() => {
    const m = map.current;
    if (!m || !mapLoaded) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    const coords = vertices ?? polygon?.coordinates[0].slice(0, -1);
    const geometry =
      coords && coords.length >= 3 ? polygonFromVertices(coords) : null;
    if (m.getLayer("boundary-fill")) m.removeLayer("boundary-fill");
    if (m.getLayer("boundary-line")) m.removeLayer("boundary-line");
    if (m.getSource("boundary")) m.removeSource("boundary");
    if (geometry) {
      m.addSource("boundary", {
        type: "geojson",
        data: { type: "Feature", geometry, properties: {} },
      });
      m.addLayer({
        id: "boundary-fill",
        type: "fill",
        source: "boundary",
        paint: { "fill-color": "#287250", "fill-opacity": 0.2 },
      });
      m.addLayer({
        id: "boundary-line",
        type: "line",
        source: "boundary",
        paint: { "line-color": "#176145", "line-width": 2.5 },
      });
    }
    if (coords)
      coords.forEach((v, i) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "vertex-marker";
        dot.textContent = String(i + 1);
        dot.setAttribute("aria-label", `Vertex ${i + 1}`);
        const marker = new maplibregl.Marker({
          element: dot,
          draggable: !!onVertices,
        })
          .setLngLat(v as [number, number])
          .addTo(m);
        marker.on("dragend", () => {
          const p = marker.getLngLat();
          const next = [...(latest.current.vertices ?? [])];
          next[i] = [p.lng, p.lat];
          latest.current.onVertices?.(next);
        });
        markers.current.push(marker);
      });
    farmers
      .filter((f) => f.gps)
      .forEach((f) => {
        const dot = document.createElement("span");
        dot.className = "farmer-marker";
        const popup = new maplibregl.Popup({ offset: 16 }).setText(
          `${f.name} · ${f.ref}`,
        );
        markers.current.push(
          new maplibregl.Marker({ element: dot })
            .setLngLat([f.gps!.longitude, f.gps!.latitude])
            .setPopup(popup)
            .addTo(m),
        );
      });
    const boundsPoints = coords?.length
      ? coords
      : farmers
          .filter((f) => f.gps)
          .map((f) => [f.gps!.longitude, f.gps!.latitude]);
    if (boundsPoints?.length && !onVertices) {
      const bounds = new maplibregl.LngLatBounds();
      boundsPoints.forEach((v) => bounds.extend(v as [number, number]));
      m.fitBounds(bounds, { padding: 42, maxZoom: 15, duration: 0 });
    }
  }, [mapLoaded, vertices, polygon, farmers, onVertices]);
  return (
    <div className={`field-map ${compact ? "map-compact" : ""}`}>
      <div ref={el} className="map-canvas" />
      {failed && (
        <div className="map-fallback">
          <BoundaryPreview
            polygon={
              polygon ??
              (vertices?.length ? polygonFromVertices(vertices) : null)
            }
          />
          <p>Map display unavailable on this device.</p>
        </div>
      )}
      <div className="map-title">
        <span className="map-symbol">
          <MapPin size={15} />
        </span>
        {onVertices ? "Tap the map to add vertices" : "Project field coverage"}
      </div>
      <div className="map-controls">
        <Button
          variant="outline"
          size="icon"
          aria-label="Zoom in"
          onClick={() => map.current?.zoomIn()}
        >
          <Plus size={17} />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Zoom out"
          onClick={() => map.current?.zoomOut()}
        >
          <Minus size={17} />
        </Button>
      </div>
      {(!online || tilesFailed) && (
        <div className="map-offline">
          <WifiOff size={14} />
          {!online
            ? "Offline · boundary available, basemap unavailable"
            : "Basemap unavailable · recorded geometry remains visible"}
        </div>
      )}
    </div>
  );
}
export function BoundaryPreview({ polygon }: { polygon?: Polygon | null }) {
  if (!polygon)
    return (
      <div className="empty-map">
        <MapPin size={24} />
        <span>No boundary captured</span>
      </div>
    );
  const r = polygon.coordinates[0];
  const xs = r.map((p) => p[0]),
    ys = r.map((p) => p[1]);
  const minx = Math.min(...xs),
    miny = Math.min(...ys),
    dx = Math.max(...xs) - minx || 1,
    dy = Math.max(...ys) - miny || 1;
  const scale = Math.min(240 / dx, 140 / dy);
  const pts = r
    .map((p) => `${30 + (p[0] - minx) * scale},${170 - (p[1] - miny) * scale}`)
    .join(" ");
  return (
    <svg
      viewBox="0 0 300 200"
      className="boundary-svg"
      role="img"
      aria-label={`Recorded boundary, ${areaHectares(polygon).toFixed(2)} hectares`}
    >
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" className="grid-line" />
        </pattern>
      </defs>
      <rect width="300" height="200" fill="url(#grid)" />
      <polygon points={pts} />
      {r.slice(0, -1).map((p, i) => (
        <circle
          key={i}
          cx={30 + (p[0] - minx) * scale}
          cy={170 - (p[1] - miny) * scale}
          r="3.5"
        />
      ))}
    </svg>
  );
}
export function GPSCapture({
  value,
  onChange,
  threshold = 20,
  lang = "en",
}: {
  value?: GPS | null;
  onChange: (v: GPS) => void;
  threshold?: number;
  lang?: "en" | "hi";
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [poor, setPoor] = useState<GPS | null>(null),
    [reason, setReason] = useState("");
  async function capture() {
    setBusy(true);
    setError("");
    try {
      const gps = await captureGPS(threshold);
      if (gpsAcceptable(gps, threshold)) {
        setPoor(null);
        onChange(gps);
      } else setPoor(gps);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="gps-capture">
      <Button type="button" variant="outline" onClick={capture} disabled={busy}>
        <LocateFixed size={17} />
        {busy
          ? lang === "hi"
            ? "स्थान प्राप्त हो रहा है…"
            : "Acquiring GPS…"
          : value
            ? lang === "hi"
              ? "स्थान फिर से लें"
              : "Recapture location"
            : lang === "hi"
              ? "जीपीएस स्थान लें"
              : "Capture GPS"}
      </Button>
      {value && (
        <span className="gps-value">
          {value.latitude.toFixed(6)}, {value.longitude.toFixed(6)}
          <small>
            ±{Math.round(value.accuracy)} m ·{" "}
            {new Date(value.timestamp).toLocaleTimeString()}{" "}
            {value.override_reason && `· Override: ${value.override_reason}`}
          </small>
        </span>
      )}
      {poor && (
        <div className="notice warning">
          <p>
            Accuracy is ±{Math.round(poor.accuracy)} m; the target is{" "}
            {threshold} m. Try again outdoors, or record why this fix is
            acceptable.
          </p>
          <label>
            Accuracy override reason
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={!reason.trim()}
            onClick={() => {
              onChange({ ...poor, override_reason: reason.trim() });
              setPoor(null);
            }}
          >
            Use with reason
          </Button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function BoundaryEditor({
  value,
  vertexGps,
  onChange,
  online,
  threshold,
}: {
  value: Polygon | null;
  vertexGps: GPS[];
  onChange: (polygon: Polygon | null, gps: GPS[]) => void;
  online: boolean;
  threshold: number;
}) {
  const [lat, setLat] = useState(""),
    [lon, setLon] = useState(""),
    [error, setError] = useState("");
  const vertices = value?.coordinates[0].slice(0, -1) ?? [];
  const update = (v: number[][]) =>
    onChange(v.length ? polygonFromVertices(v) : null, vertexGps);
  const validation = validatePolygon(value);
  return (
    <div className="boundary-editor">
      <FieldMap
        polygon={value}
        vertices={vertices}
        onVertices={update}
        online={online}
      />
      <div className="boundary-tools">
        <div>
          <strong>{vertices.length} vertices</strong>
          <span className="muted"> · {areaHectares(value).toFixed(3)} ha</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          disabled={!vertices.length}
          onClick={() => {
            update(vertices.slice(0, -1));
          }}
        >
          <Undo2 size={16} />
          Undo vertex
        </Button>
      </div>
      <p className="muted small">
        Tap to draw, drag markers to edit, or record GPS vertices in order.
        Satellite imagery is online-only.
      </p>
      <GPSCapture
        threshold={threshold}
        onChange={(gps) =>
          onChange(
            polygonFromVertices([...vertices, [gps.longitude, gps.latitude]]),
            [...vertexGps, gps],
          )
        }
      />
      <details className="vertex-details">
        <summary>View / enter coordinates</summary>
        <div className="coordinate-inputs">
          <label>
            Latitude
            <input
              type="number"
              step="any"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
            />
          </label>
          <label>
            Longitude
            <input
              type="number"
              step="any"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const a = Number(lat),
                o = Number(lon);
              if (
                !lat ||
                !lon ||
                !Number.isFinite(a) ||
                !Number.isFinite(o) ||
                Math.abs(a) > 90 ||
                Math.abs(o) > 180
              ) {
                setError("Enter a valid latitude and longitude.");
                return;
              }
              setError("");
              update([...vertices, [o, a]]);
              setLat("");
              setLon("");
            }}
          >
            Add vertex
          </Button>
        </div>
        <ol>
          {vertices.map((v, i) => (
            <li key={i}>
              <span>
                {v[1].toFixed(6)}, {v[0].toFixed(6)}
              </span>
              <button
                type="button"
                className="text-button"
                onClick={() => update(vertices.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
      </details>
      {error && <p className="error">{error}</p>}
      <p className={validation ? "muted small" : "success small"}>
        {validation || "✓ Valid boundary · saved with this visit"}
      </p>
    </div>
  );
}
