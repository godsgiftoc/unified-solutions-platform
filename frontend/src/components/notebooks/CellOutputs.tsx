"use client";

import type { CellOutput } from "@/lib/api";
import { DataTable } from "@/components/charts/DataTable";

export function CellOutputs({ outputs }: { outputs: CellOutput[] }) {
  if (!outputs?.length) return null;
  return (
    <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 p-3 dark:bg-white/5">
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
          <pre key={i} className="overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 font-mono text-xs leading-relaxed text-slate-700 ring-1 ring-slate-100 dark:ring-white/10">
            {o.text}
          </pre>
        );
      })}
    </div>
  );
}
