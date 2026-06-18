"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import type { QueryResult } from "@/lib/api";
import { DataTable } from "./DataTable";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

let registered = false;

/** Nigeria state choropleth. x = state name (matches GeoJSON shapeName), y = value. */
export function MapChart({
  result,
  xKey,
  yKey,
  height,
}: {
  result: QueryResult;
  xKey: string;
  yKey: string;
  height: number | string;
}) {
  const [ready, setReady] = useState(registered);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (registered) return;
    (async () => {
      try {
        const echarts = await import("echarts");
        const geo = await fetch("/geo/nigeria-states.geojson").then((r) => r.json());
        echarts.registerMap("nigeria", geo);
        registered = true;
        setReady(true);
      } catch {
        setFailed(true);
      }
    })();
  }, []);

  if (failed) return <DataTable result={result} maxHeight="max-h-full" />;
  if (!ready) return <p className="p-4 text-sm text-slate-400">Loading map…</p>;

  const xi = result.columns.indexOf(xKey);
  const yi = result.columns.indexOf(yKey);
  const data = result.rows.map((r) => ({ name: String(r[xi]), value: Number(r[yi]) || 0 }));
  const max = Math.max(1, ...data.map((d) => d.value));
  const fmt = (v: number) => (typeof v === "number" && !Number.isNaN(v) ? v.toLocaleString() : "—");

  const option = {
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(15,23,42,0.92)",
      borderWidth: 0,
      padding: [8, 12],
      textStyle: { color: "#fff", fontSize: 12 },
      formatter: (p: { name: string; value: number }) =>
        Number.isNaN(p.value) || p.value === undefined
          ? `<b>${p.name}</b><br/><span style="opacity:.7">No data</span>`
          : `<b>${p.name}</b><br/>${yKey}: <b>${fmt(p.value)}</b>`,
    },
    visualMap: {
      min: 0,
      max,
      left: 12,
      bottom: 14,
      calculable: true,
      itemWidth: 12,
      itemHeight: 120,
      inRange: { color: ["#eef1ff", "#c6ccff", "#827ef8", "#5340e0", "#1d1849"] },
      textStyle: { fontSize: 10, color: "#64748b" },
    },
    series: [
      {
        type: "map",
        map: "nigeria",
        nameProperty: "shapeName",
        roam: true,
        scaleLimit: { min: 1, max: 6 },
        layoutCenter: ["50%", "52%"],
        layoutSize: "112%",
        select: { disabled: true },
        label: { show: false },
        emphasis: {
          label: { show: true, color: "#0f172a", fontSize: 11, fontWeight: "bold" },
          itemStyle: {
            areaColor: "#2dd4bf",
            borderColor: "#fff",
            borderWidth: 1,
            shadowBlur: 12,
            shadowColor: "rgba(15,23,42,0.25)",
          },
        },
        itemStyle: { borderColor: "#ffffff", borderWidth: 0.8, areaColor: "#e2e8f0" },
        data,
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: height === "100%" ? "100%" : height, width: "100%", minHeight: 240 }} notMerge />;
}
