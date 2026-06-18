"use client";

import dynamic from "next/dynamic";

import type { QueryResult } from "@/lib/api";
import { DataTable } from "./DataTable";
import { MapChart } from "./MapChart";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });
const GeoMap = dynamic(() => import("./GeoMap").then((m) => m.GeoMap), { ssr: false });

export interface Encoding {
  x?: string;
  y?: string;
  series?: string;
  lat?: string;
  lon?: string;
  value?: string;
  label?: string;
}

export const VIZ_TYPES = [
  "column", "bar", "line", "area", "pie", "scatter", "bubble", "histogram", "map", "geomap", "table",
];

const PALETTE = ["#5340e0", "#14b8a6", "#8b7ff2", "#0d9488", "#312a7d", "#2dd4bf", "#a3a9fc"];

export function ChartView({
  vizType,
  encoding,
  result,
  height = 300,
}: {
  vizType: string;
  encoding: Encoding;
  result: QueryResult;
  height?: number | string;
}) {
  if (vizType === "geomap") {
    if (!encoding.lat || !encoding.lon) return <DataTable result={result} maxHeight="max-h-full" />;
    return <GeoMap result={result} latKey={encoding.lat} lonKey={encoding.lon} valueKey={encoding.value} labelKey={encoding.label} height={height} />;
  }
  if (vizType === "table" || !encoding.x) {
    return <DataTable result={result} maxHeight="max-h-full" />;
  }
  // Histogram needs only x; everything else (except table) needs y too.
  if (vizType !== "histogram" && !encoding.y) {
    return <DataTable result={result} maxHeight="max-h-full" />;
  }
  if (vizType === "map" && encoding.y) {
    return <MapChart result={result} xKey={encoding.x} yKey={encoding.y} height={height} />;
  }

  const xi = result.columns.indexOf(encoding.x);
  const yi = encoding.y ? result.columns.indexOf(encoding.y) : -1;
  if (xi < 0) return <DataTable result={result} maxHeight="max-h-full" />;

  const categories = result.rows.map((r) => String(r[xi]));
  const values = result.rows.map((r) => Number(r[yi]) || 0);

  if (vizType === "histogram") {
    const nums = result.rows.map((r) => Number(r[xi])).filter((n) => !Number.isNaN(n));
    const lo = Math.min(...nums), hi = Math.max(...nums);
    const bins = 10;
    const width = (hi - lo) / bins || 1;
    const counts = new Array(bins).fill(0);
    nums.forEach((n) => {
      const idx = Math.min(bins - 1, Math.floor((n - lo) / width));
      counts[idx] += 1;
    });
    const labels = counts.map((_, i) => `${(lo + i * width).toFixed(0)}`);
    const option = {
      grid: { top: 20, right: 16, bottom: 36, left: 44, containLabel: true },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: labels, axisLabel: { color: "#64748b", fontSize: 11 } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: "#eef2f7" } }, axisLabel: { color: "#64748b", fontSize: 11 } },
      series: [{ type: "bar", data: counts, barWidth: "98%", itemStyle: { color: "#5340e0" } }],
    };
    return <ReactECharts option={option} style={{ height, width: "100%" }} notMerge />;
  }

  if (vizType === "bubble") {
    const maxV = Math.max(1, ...values);
    const option = {
      grid: { top: 24, right: 20, bottom: 36, left: 52, containLabel: true },
      tooltip: { trigger: "item" },
      xAxis: { type: "category", data: categories, axisLabel: { color: "#64748b", fontSize: 11 } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: "#eef2f7" } }, axisLabel: { color: "#64748b", fontSize: 11 } },
      series: [
        {
          type: "scatter",
          data: values.map((v, i) => [categories[i], v]),
          symbolSize: (val: [string, number]) => 10 + (val[1] / maxV) * 44,
          itemStyle: { color: "rgba(83,64,224,0.55)", borderColor: "#5340e0" },
        },
      ],
    };
    return <ReactECharts option={option} style={{ height, width: "100%" }} notMerge />;
  }

  const base = {
    grid: { top: 28, right: 20, bottom: 36, left: 52, containLabel: true },
    tooltip: { trigger: vizType === "scatter" || vizType === "pie" ? "item" : "axis" },
    color: PALETTE,
  };
  const catAxis = { type: "category", data: categories, axisLabel: { color: "#64748b", fontSize: 11 } };
  const valAxis = { type: "value", splitLine: { lineStyle: { color: "#eef2f7" } }, axisLabel: { color: "#64748b", fontSize: 11 } };

  let option: Record<string, unknown>;
  switch (vizType) {
    case "pie":
      option = {
        ...base,
        series: [{ type: "pie", radius: ["42%", "70%"], data: result.rows.map((r) => ({ name: String(r[xi]), value: Number(r[yi]) || 0 })) }],
      };
      break;
    case "scatter":
      option = {
        ...base,
        xAxis: { ...valAxis, name: encoding.x },
        yAxis: { ...valAxis, name: encoding.y },
        series: [{ type: "scatter", symbolSize: 11, data: result.rows.map((r) => [Number(r[xi]), Number(r[yi])]) }],
      };
      break;
    case "bar": // horizontal bars
      option = {
        ...base,
        xAxis: valAxis,
        yAxis: catAxis,
        series: [{ type: "bar", data: values, barWidth: "55%", itemStyle: { color: "#5340e0", borderRadius: [0, 4, 4, 0] } }],
      };
      break;
    case "line":
      option = {
        ...base,
        xAxis: catAxis,
        yAxis: valAxis,
        series: [{ type: "line", smooth: true, showSymbol: false, data: values, lineStyle: { width: 3, color: "#5340e0" } }],
      };
      break;
    case "area":
      option = {
        ...base,
        xAxis: { ...catAxis, boundaryGap: false },
        yAxis: valAxis,
        series: [
          {
            type: "line",
            smooth: true,
            showSymbol: false,
            data: values,
            lineStyle: { width: 3, color: "#5340e0" },
            areaStyle: {
              color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(83,64,224,0.35)" }, { offset: 1, color: "rgba(83,64,224,0.03)" }] },
            },
          },
        ],
      };
      break;
    default: // "column" — vertical bars
      option = {
        ...base,
        xAxis: catAxis,
        yAxis: valAxis,
        series: [{ type: "bar", data: values, barWidth: "55%", itemStyle: { color: "#5340e0", borderRadius: [4, 4, 0, 0] } }],
      };
  }

  return <ReactECharts option={option} style={{ height, width: "100%" }} notMerge />;
}
