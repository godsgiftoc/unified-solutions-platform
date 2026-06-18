"use client";

import type { CellOutput } from "@/lib/api";
import { DataTable } from "@/components/charts/DataTable";

export function CellOutputs({ outputs }: { outputs: CellOutput[] }) {
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
            <DataTable key={i} result={{ columns: o.columns, rows: o.rows, row_count: o.rows.length, truncated: false }} />
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
    </div>
  );
}
