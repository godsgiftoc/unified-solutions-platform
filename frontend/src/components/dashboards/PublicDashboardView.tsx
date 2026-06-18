"use client";

import { useQuery } from "@tanstack/react-query";
import { SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";

import { ChartView, type Encoding } from "@/components/charts/ChartView";
import { Public, type QueryResult } from "@/lib/api";
import { applyGlobalFilters, colIndex, detectDateCol, type GlobalFilters } from "@/lib/dashboardFilters";
import { ErrorState, Spinner } from "@/components/ui";

export function PublicDashboardView({ token }: { token: string }) {
  const dash = useQuery({ queryKey: ["public-dashboard", token], queryFn: () => Public.dashboard(token), retry: false });
  const [gf, setGf] = useState<GlobalFilters>({});

  const tiles = dash.data?.tiles ?? [];

  const distinct = useMemo(() => {
    const collect = (col: string, restrictStateTo?: string) => {
      const s = new Set<string>();
      for (const t of tiles) {
        const r = t.data;
        if (!r) continue;
        const i = colIndex(r.columns, col);
        if (i < 0) continue;
        const si = colIndex(r.columns, "state");
        r.rows.forEach((row) => {
          if (restrictStateTo && si >= 0 && String(row[si]) !== restrictStateTo) return;
          s.add(String(row[i]));
        });
      }
      return [...s].sort();
    };
    return collect;
  }, [tiles]);

  const states = useMemo(() => distinct("state"), [distinct]);
  const lgas = useMemo(() => distinct("lga", gf.state), [distinct, gf.state]);
  const hasDate = useMemo(() => tiles.some((t) => t.data && !!detectDateCol(t.data.columns)), [tiles]);
  const hasFilters = states.length > 0 || lgas.length > 0 || hasDate;
  const active = !!(gf.state || gf.lga || gf.from || gf.to);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f7f9fc] to-[#eef2f8] dark:from-[#0b1220] dark:to-[#0f172a]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-azure to-brand-500 text-sm font-black text-white">U</span>
            <span className="text-sm font-semibold text-brand-950">Unified Solutions Platform</span>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">View-only</span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {dash.isLoading ? (
          <div className="flex min-h-[50vh] items-center justify-center text-slate-400"><Spinner size={26} className="text-brand-500" /></div>
        ) : dash.isError || !dash.data ? (
          <div className="mx-auto max-w-lg pt-10">
            <ErrorState title="This link isn't available" description="The share link is invalid, expired, or has been revoked. Ask the dashboard owner for a new link." />
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight text-brand-950">{dash.data.title}</h1>
            {dash.data.description && <p className="mt-1 max-w-2xl text-sm text-slate-500">{dash.data.description}</p>}

            {hasFilters && (
              <div className="mt-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-card">
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-600"><SlidersHorizontal size={15} className="text-brand-500" /> Filters</span>
                {states.length > 0 && (
                  <label className="inline-flex items-center gap-1.5">
                    <span className="text-xs text-slate-400">State</span>
                    <select aria-label="Filter by state" value={gf.state ?? ""} onChange={(e) => setGf((f) => ({ ...f, state: e.target.value || undefined, lga: undefined }))} className="rounded-lg border border-slate-300 px-2 py-1 text-sm ring-focus">
                      <option value="">All states</option>
                      {states.map((v) => <option key={v}>{v}</option>)}
                    </select>
                  </label>
                )}
                {lgas.length > 0 && (
                  <label className="inline-flex items-center gap-1.5">
                    <span className="text-xs text-slate-400">LGA</span>
                    <select aria-label="Filter by LGA" value={gf.lga ?? ""} onChange={(e) => setGf((f) => ({ ...f, lga: e.target.value || undefined }))} className="rounded-lg border border-slate-300 px-2 py-1 text-sm ring-focus">
                      <option value="">All LGAs</option>
                      {lgas.map((v) => <option key={v}>{v}</option>)}
                    </select>
                  </label>
                )}
                {hasDate && (
                  <label className="inline-flex items-center gap-1.5">
                    <span className="text-xs text-slate-400">From</span>
                    <input type="date" aria-label="From date" value={gf.from ?? ""} onChange={(e) => setGf((f) => ({ ...f, from: e.target.value || undefined }))} className="rounded-lg border border-slate-300 px-2 py-1 text-sm ring-focus" />
                    <span className="text-xs text-slate-400">to</span>
                    <input type="date" aria-label="To date" value={gf.to ?? ""} onChange={(e) => setGf((f) => ({ ...f, to: e.target.value || undefined }))} className="rounded-lg border border-slate-300 px-2 py-1 text-sm ring-focus" />
                  </label>
                )}
                {active && <button onClick={() => setGf({})} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"><X size={12} /> Clear all</button>}
              </div>
            )}

            {tiles.length === 0 ? (
              <p className="mt-8 text-sm text-slate-400">This dashboard has no charts yet.</p>
            ) : (
              <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
                {tiles.map((t) => {
                  const result = t.data ? applyGlobalFilters(t.data as QueryResult, gf) : null;
                  return (
                    <div key={t.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
                      <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-brand-950">{t.title}</div>
                      <div className="p-3">
                        {result ? (
                          <div className="h-[320px]"><ChartView vizType={t.viz_type ?? "table"} encoding={(t.encoding ?? {}) as Encoding} result={result} height="100%" /></div>
                        ) : (
                          <p className="p-4 text-sm text-slate-400">No data.</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="mt-10 text-center text-xs text-slate-400">Powered by Unified Solutions Platform</p>
          </>
        )}
      </main>
    </div>
  );
}
