"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";

import type { QueryResult } from "@/lib/api";

/** OpenStreetMap point map: plots lat/lon, sizes/colours markers by a value. */
export function GeoMap({
  result,
  latKey,
  lonKey,
  valueKey,
  labelKey,
  height,
}: {
  result: QueryResult;
  latKey: string;
  lonKey: string;
  valueKey?: string;
  labelKey?: string;
  height: number | string;
}) {
  const li = result.columns.indexOf(latKey);
  const oi = result.columns.indexOf(lonKey);
  const vi = valueKey ? result.columns.indexOf(valueKey) : -1;
  const lblI = labelKey ? result.columns.indexOf(labelKey) : -1;

  const pts = result.rows
    .map((r) => ({
      lat: Number(r[li]),
      lon: Number(r[oi]),
      value: vi >= 0 ? Number(r[vi]) || 0 : 1,
      label: lblI >= 0 ? String(r[lblI]) : "",
    }))
    .filter((p) => !Number.isNaN(p.lat) && !Number.isNaN(p.lon) && p.lat !== 0);

  if (!pts.length) {
    return <p className="p-4 text-sm text-slate-400">No valid lat/lon points to plot.</p>;
  }

  const maxV = Math.max(1, ...pts.map((p) => p.value));
  const center: [number, number] = [
    pts.reduce((s, p) => s + p.lat, 0) / pts.length,
    pts.reduce((s, p) => s + p.lon, 0) / pts.length,
  ];

  return (
    <MapContainer
      center={center}
      zoom={6}
      scrollWheelZoom
      style={{ height: height === "100%" ? "100%" : height, width: "100%", minHeight: 240, borderRadius: 8 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {pts.map((p, i) => (
        <CircleMarker
          key={i}
          center={[p.lat, p.lon]}
          radius={6 + (p.value / maxV) * 22}
          pathOptions={{ color: "#5340e0", fillColor: "#14b8a6", fillOpacity: 0.5, weight: 1 }}
        >
          <Tooltip>{p.label ? `${p.label}: ` : ""}{p.value}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
