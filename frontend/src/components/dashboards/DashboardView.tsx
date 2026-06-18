"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Responsive, WidthProvider, type Layout } from "react-grid-layout";

import { ChartView } from "@/components/charts/ChartView";
import { Charts, Dashboards, type DashboardTile } from "@/lib/api";

const Grid = WidthProvider(Responsive);

/** Read-only dashboard renderer (marketplace + share views — no edit controls). */
export function DashboardView({ dashboardId, backHref = "/marketplace" }: { dashboardId: string; backHref?: string }) {
  const dash = useQuery({ queryKey: ["dashboard", dashboardId], queryFn: () => Dashboards.get(dashboardId) });

  if (dash.isLoading) return <p className="text-slate-400">Loading…</p>;
  if (!dash.data) return <p className="text-slate-400">Dashboard not found.</p>;
  const d = dash.data;

  const layout: Layout[] = d.tiles.map((t, i) => ({
    i: t.id,
    x: t.layout.x ?? (i * 4) % 12,
    y: t.layout.y ?? Math.floor(i / 3) * 6,
    w: t.layout.w ?? 4,
    h: t.layout.h ?? 6,
  }));

  return (
    <div>
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-700">
        <ArrowLeft size={15} /> Back
      </Link>
      <div className="mt-3 border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-brand-950">{d.title}</h1>
        {d.description && <p className="mt-1 max-w-2xl text-slate-500">{d.description}</p>}
      </div>

      {d.tiles.length === 0 ? (
        <p className="mt-8 text-sm text-slate-400">This dashboard has no tiles yet.</p>
      ) : (
        <div className="mt-4">
          <Grid
            className="layout"
            layouts={{ lg: layout, md: layout, sm: layout }}
            breakpoints={{ lg: 1200, md: 900, sm: 0 }}
            cols={{ lg: 12, md: 12, sm: 6 }}
            rowHeight={40}
            isDraggable={false}
            isResizable={false}
          >
            {d.tiles.map((t) => (
              <div key={t.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
                <ViewTile tile={t} />
              </div>
            ))}
          </Grid>
        </div>
      )}
    </div>
  );
}

function ViewTile({ tile }: { tile: DashboardTile }) {
  const data = useQuery({
    queryKey: ["chart-data", tile.chart_id],
    queryFn: () => Charts.data(tile.chart_id!),
    enabled: !!tile.chart_id,
  });
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-brand-950">{tile.title}</div>
      <div className="min-h-0 flex-1 p-3">
        {data.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
        {data.data && (
          <div className="h-full">
            <ChartView vizType={tile.viz_type ?? "table"} encoding={tile.encoding ?? {}} result={data.data} height="100%" />
          </div>
        )}
      </div>
    </div>
  );
}
