"use client";

import dynamic from "next/dynamic";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

const option = {
  grid: { top: 28, right: 16, bottom: 24, left: 36 },
  tooltip: { trigger: "axis" },
  legend: {
    data: ["ANC visits", "Facilities reporting"],
    top: 0,
    textStyle: { color: "#64748b", fontSize: 11 },
    icon: "roundRect",
  },
  xAxis: {
    type: "category",
    boundaryGap: false,
    data: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"],
    axisLine: { lineStyle: { color: "#cbd5e1" } },
    axisLabel: { color: "#94a3b8", fontSize: 11 },
  },
  yAxis: {
    type: "value",
    splitLine: { lineStyle: { color: "#eef2f7" } },
    axisLabel: { color: "#94a3b8", fontSize: 11 },
  },
  series: [
    {
      name: "ANC visits",
      type: "line",
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 3, color: "#5340e0" },
      areaStyle: {
        color: {
          type: "linear",
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: "rgba(83,64,224,0.35)" },
            { offset: 1, color: "rgba(83,64,224,0.02)" },
          ],
        },
      },
      data: [820, 932, 901, 1290, 1330, 1520, 1410, 1680],
    },
    {
      name: "Facilities reporting",
      type: "bar",
      barWidth: 10,
      itemStyle: { color: "#a3a9fc", borderRadius: [3, 3, 0, 0] },
      data: [320, 402, 391, 534, 590, 630, 601, 720],
    },
  ],
};

export function HeroChart() {
  return <ReactECharts option={option} style={{ height: 240, width: "100%" }} />;
}
