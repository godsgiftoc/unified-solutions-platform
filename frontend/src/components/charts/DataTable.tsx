"use client";

import type { QueryResult } from "@/lib/api";

export function DataTable({ result, maxHeight = "max-h-[420px]" }: { result: QueryResult; maxHeight?: string }) {
  if (!result.columns.length) return <p className="p-4 text-sm text-slate-400">No columns.</p>;
  return (
    <div className={`${maxHeight} overflow-auto rounded-lg border border-slate-200`}>
      <table className="min-w-full text-left text-sm">
        <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {result.columns.map((c) => (
              <th key={c} className="whitespace-nowrap px-3 py-2 font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/10">
          {result.rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/5">
              {row.map((cell, j) => (
                <td key={j} className="whitespace-nowrap px-3 py-1.5 text-slate-700">
                  {cell === null ? <span className="text-slate-300">null</span> : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.truncated && (
        <div className="bg-amber-50 px-3 py-1.5 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          Showing first {result.row_count} rows (result truncated).
        </div>
      )}
    </div>
  );
}
