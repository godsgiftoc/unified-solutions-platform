"use client";

import { BarChart3 } from "lucide-react";
import { useState } from "react";

import type { CellOutput } from "@/lib/api";
import { DataTable } from "@/components/charts/DataTable";
import { ChartFromTable } from "./ChartFromTable";

export function CellOutputs({ outputs, workspaceId }: { outputs: CellOutput[]; workspaceId?: string }) {
  // The table output currently being turned into a chart (modal open when set).
  const [chartOutput, setChartOutput] = useState<CellOutput | null>(null);

  if (!outputs?.length) return null;
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-card dark:border-white/10 dark:bg-white/[0.03]">
      {outputs.map((o, i) => {
        if (o.type === "image") {
          // eslint-disable-next-line @next/next/no-img-element
          return <img key={i} src={`data:image/png;base64,${o.data}`} alt="output" className="max-w-full rounded-lg border border-slate-200 bg-white" />;
        }
        if (o.type === "table" && o.columns && o.rows) {
          return (
            <div key={i} className="space-y-2">
              {workspaceId && (
                <div className="flex justify-end">
                  <button
                    onClick={() => setChartOutput(o)}
                    title="Turn this table into a chart"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-brand-700 shadow-sm transition hover:border-brand-300 hover:bg-brand-50 dark:border-white/10"
                  >
                    <BarChart3 size={13} /> Create chart
                  </button>
                </div>
              )}
              <DataTable result={{ columns: o.columns, rows: o.rows, row_count: o.rows.length, truncated: false }} />
            </div>
          );
        }
        if (o.type === "error") {
          return (
            <pre key={i} className="overflow-auto rounded-lg bg-red-50 p-3 text-xs leading-relaxed text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {o.text}
            </pre>
          );
        }
        return (
          <pre key={i} className="overflow-auto whitespace-pre-wrap px-1 font-mono text-xs leading-relaxed text-slate-700">
            {o.text}
          </pre>
        );
      })}

      {workspaceId && chartOutput && (
        <ChartFromTable workspaceId={workspaceId} output={chartOutput} onClose={() => setChartOutput(null)} />
      )}
    </div>
  );
}
