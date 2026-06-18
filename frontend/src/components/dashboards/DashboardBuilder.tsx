"use client";

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AreaChart,
  ArrowLeft,
  BarChart3,
  BarChartBig,
  BarChartHorizontalBig,
  Boxes,
  Check,
  Copy,
  Globe,
  GripVertical,
  LineChart,
  Loader2,
  Map as MapIcon,
  Pencil,
  PieChart,
  ScatterChart,
  Share2,
  SlidersHorizontal,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Responsive, type Layout } from "react-grid-layout";

import { ChartView, VIZ_TYPES, type Encoding } from "@/components/charts/ChartView";
import { Charts, Dashboards, type DashboardTile, type QueryResult } from "@/lib/api";
import { Button, Field, inputClass, Modal, Spinner } from "@/components/ui";
import { applyGlobalFilters, colIndex, detectDateCol, type GlobalFilters } from "@/lib/dashboardFilters";
import { useToast } from "@/lib/toast";

// Measure the canvas with a ResizeObserver so the grid re-lays-out whenever the
// available width changes — including when the properties rail appears (which
// react-grid-layout's WidthProvider misses, since it only listens to window resize).
function useContainerWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const VIZ_ICONS: Record<string, LucideIcon> = {
  column: BarChart3,
  bar: BarChartHorizontalBig,
  line: LineChart,
  area: AreaChart,
  pie: PieChart,
  scatter: ScatterChart,
  bubble: Boxes,
  histogram: BarChartBig,
  map: MapIcon,
  geomap: Globe,
  table: Table2,
};

export function DashboardBuilder({ dashboardId }: { dashboardId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const dash = useQuery({ queryKey: ["dashboard", dashboardId], queryFn: () => Dashboards.get(dashboardId) });
  const workspaceId = dash.data?.workspace_id;
  const charts = useQuery({
    queryKey: ["charts", workspaceId],
    queryFn: () => Charts.list(workspaceId),
    enabled: !!workspaceId,
  });

  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layoutState, setLayoutState] = useState<Layout[] | null>(null);
  const [gf, setGf] = useState<GlobalFilters>({});
  const [shareOpen, setShareOpen] = useState(false);
  const [canvasRef, canvasW] = useContainerWidth();

  const tiles = dash.data?.tiles ?? [];

  // Lift data fetching so the panel + global filters can work centrally.
  const tileData = useQueries({
    queries: tiles.map((t) => ({
      queryKey: ["chart-data", t.chart_id],
      queryFn: () => Charts.data(t.chart_id!),
      enabled: !!t.chart_id,
    })),
  });
  const dataByTile = useMemo(() => {
    const m: Record<string, QueryResult | undefined> = {};
    tiles.forEach((t, i) => (m[t.id] = tileData[i]?.data));
    return m;
  }, [tiles, tileData]);

  // Distinct values of a column across every tile (for the filter selects).
  const distinctValues = useMemo(() => {
    const collect = (col: string, restrictStateTo?: string) => {
      const s = new Set<string>();
      Object.values(dataByTile).forEach((r) => {
        if (!r) return;
        const i = colIndex(r.columns, col);
        if (i < 0) return;
        const si = colIndex(r.columns, "state");
        r.rows.forEach((row) => {
          if (restrictStateTo && si >= 0 && String(row[si]) !== restrictStateTo) return;
          s.add(String(row[i]));
        });
      });
      return [...s].sort();
    };
    return collect;
  }, [dataByTile]);

  const states = useMemo(() => distinctValues("state"), [distinctValues]);
  const lgas = useMemo(() => distinctValues("lga", gf.state), [distinctValues, gf.state]);
  const hasDate = useMemo(
    () => Object.values(dataByTile).some((r) => r && !!detectDateCol(r.columns)),
    [dataByTile],
  );
  const hasFilters = states.length > 0 || lgas.length > 0 || hasDate;
  const activeFilters = !!(gf.state || gf.lga || gf.from || gf.to);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["dashboard", dashboardId] });
  const addTile = useMutation({
    mutationFn: (chartId: string) => Dashboards.addTile(dashboardId, chartId),
    onSuccess: () => { invalidate(); toast("Chart added to dashboard"); },
    onError: () => toast("Couldn't add chart", "error"),
  });
  const deleteTile = useMutation({
    mutationFn: (tileId: string) => Dashboards.deleteTile(dashboardId, tileId),
    onSuccess: () => { invalidate(); setSelectedId(null); toast("Tile removed"); },
    onError: () => toast("Couldn't remove tile", "error"),
  });
  const saveLayout = useMutation({
    mutationFn: (items: { id: string; layout: object }[]) => Dashboards.saveLayout(dashboardId, items),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dashboards"] }); toast("Dashboard saved"); },
    onError: () => toast("Couldn't save the dashboard", "error"),
  });
  const publish = useMutation({
    mutationFn: (status: string) => Dashboards.update(dashboardId, { status }),
    onSuccess: (_d, status) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["dashboards"] });
      toast(status === "published" ? "Published to the marketplace" : "Moved to draft");
    },
    onError: () => toast("Couldn't update publish status", "error"),
  });
  const updateDesc = useMutation({ mutationFn: (description: string) => Dashboards.update(dashboardId, { description }) });
  const renameDash = useMutation({
    mutationFn: (title: string) => Dashboards.update(dashboardId, { title }),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["dashboards"] }); toast("Dashboard renamed"); },
    onError: () => toast("Couldn't rename the dashboard", "error"),
  });

  if (dash.isLoading) return <p className="text-slate-400">Loading…</p>;
  if (!dash.data) return <p className="text-slate-400">Dashboard not found.</p>;
  const d = dash.data;
  const published = d.status === "published";
  const selectedTile = tiles.find((t) => t.id === selectedId) ?? null;

  const layout: Layout[] = tiles.map((t, i) => ({
    i: t.id,
    x: t.layout.x ?? (i * 4) % 12,
    y: t.layout.y ?? Math.floor(i / 3) * 6,
    w: t.layout.w ?? 4,
    h: t.layout.h ?? 6,
    minW: 2,
    minH: 4,
  }));
  const saveNow = () => saveLayout.mutate((layoutState ?? layout).map((it) => ({ id: it.i, layout: { x: it.x, y: it.y, w: it.w, h: it.h } })));

  return (
    <div className={`transition-[padding] duration-200 ${editing && selectedTile ? "lg:pr-[372px]" : ""}`}>
      <Link href="/dashboards" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-700">
        <ArrowLeft size={15} /> All dashboards
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              key={`title-${d.id}`}
              defaultValue={d.title}
              aria-label="Dashboard title"
              placeholder="Dashboard title"
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== d.title) renameDash.mutate(v); }}
              className="-ml-0.5 w-full max-w-2xl rounded border-0 bg-transparent text-2xl font-extrabold tracking-tight text-brand-950 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          ) : (
            <h1 className="text-2xl font-extrabold tracking-tight text-brand-950">{d.title}</h1>
          )}
          {editing ? (
            <input
              key={d.id}
              defaultValue={d.description ?? ""}
              placeholder="Add a description (shown on the marketplace)…"
              onBlur={(e) => e.target.value !== (d.description ?? "") && updateDesc.mutate(e.target.value)}
              className="mt-0.5 w-full max-w-xl border-0 bg-transparent text-sm text-slate-500 placeholder:text-slate-400 focus:outline-none"
            />
          ) : (
            d.description && <p className="mt-0.5 max-w-xl text-sm text-slate-500">{d.description}</p>
          )}
          <p className="mt-1 text-xs text-slate-400">{d.tile_count} tile{d.tile_count === 1 ? "" : "s"} · <span className={published ? "font-semibold text-emerald-600" : ""}>{d.status}</span></p>
        </div>
        <div className="flex items-center gap-2">
          {!editing ? (
            <>
              <button onClick={() => setShareOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"><Share2 size={15} /> Share</button>
              <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"><Pencil size={15} /> Edit</button>
              <button onClick={() => publish.mutate(published ? "draft" : "published")} className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold ${published ? "border border-slate-300 text-slate-700 hover:bg-slate-50" : "bg-gradient-to-r from-azure to-brand-600 text-white"}`}><Globe size={15} /> {published ? "Unpublish" : "Publish"}</button>
            </>
          ) : (
            <>
              <button onClick={saveNow} disabled={saveLayout.isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"><Check size={15} /> {saveLayout.isPending ? "Saving…" : saveLayout.isSuccess ? "Saved" : "Save"}</button>
              <button onClick={() => { saveNow(); setEditing(false); setSelectedId(null); }} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Done</button>
            </>
          )}
        </div>
      </div>

      {/* Edit toolbar (Looker-style) */}
      {editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-card">
          {charts.data && charts.data.length > 0 ? (
            <select value="" disabled={addTile.isPending} onChange={(e) => e.target.value && addTile.mutate(e.target.value)} className="cursor-pointer rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 disabled:opacity-50">
              <option value="">{addTile.isPending ? "Adding…" : "+ Add a chart"}</option>
              {charts.data.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.viz_type})</option>)}
            </select>
          ) : (
            <Link href="/sql" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">+ Create a chart</Link>
          )}
          <span className="text-xs text-slate-400">Click a tile to edit its data &amp; style →</span>
        </div>
      )}

      {/* Global filter bar — date range + State/LGA org-unit, fanned out to every tile */}
      {hasFilters && (
        <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-card">
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

          {activeFilters && (
            <button onClick={() => setGf({})} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"><X size={12} /> Clear all</button>
          )}
        </div>
      )}

      {tiles.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-400">
          {editing ? "Add a chart from the toolbar above." : "This dashboard is empty. Click “Edit” to add charts."}
        </div>
      ) : (
        <div ref={canvasRef} className="mt-4 min-w-0">
          {canvasW > 0 && (
            <Responsive
              className="layout"
              width={canvasW}
              layouts={{ lg: layout, md: layout, sm: layout }}
              breakpoints={{ lg: 1100, md: 800, sm: 0 }}
              cols={{ lg: 12, md: 12, sm: 6 }}
              rowHeight={40}
              isDraggable={editing}
              isResizable={editing}
              draggableHandle=".tile-drag"
              onLayoutChange={(l) => editing && setLayoutState(l)}
            >
              {tiles.map((t) => {
                const result = dataByTile[t.id];
                const filtered = result ? applyGlobalFilters(result, gf) : undefined;
                return (
                  <div
                    key={t.id}
                    onClick={() => editing && setSelectedId(t.id)}
                    className={`overflow-hidden rounded-2xl border bg-white shadow-card transition ${selectedId === t.id && editing ? "border-brand-500 ring-1 ring-brand-500" : "border-slate-200"}`}
                  >
                    <TileCard tile={t} result={filtered} editing={editing} loading={!result} onDelete={() => deleteTile.mutate(t.id)} />
                  </div>
                );
              })}
            </Responsive>
          )}
        </div>
      )}

      {/* Properties: a slide-in side panel that only appears when a tile is
          selected, and collapses away when closed. No permanent empty rail. */}
      {editing && selectedTile && (
        <aside aria-label="Chart properties" className="fixed bottom-0 right-0 top-20 z-20 flex w-full max-w-[360px] flex-col border-l border-slate-200 bg-white shadow-2xl">
          <PropertiesPanel
            key={selectedTile.id}
            tile={selectedTile}
            columns={dataByTile[selectedTile.id]?.columns ?? []}
            onClose={() => setSelectedId(null)}
            onSaved={() => { invalidate(); qc.invalidateQueries({ queryKey: ["chart-data", selectedTile.chart_id] }); }}
          />
        </aside>
      )}

      {shareOpen && <ShareModal dashboardId={dashboardId} onClose={() => setShareOpen(false)} />}
    </div>
  );
}

function ShareModal({ dashboardId, onClose }: { dashboardId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const share = useQuery({ queryKey: ["share", dashboardId], queryFn: () => Dashboards.getShare(dashboardId) });

  const create = useMutation({
    mutationFn: () => Dashboards.createShare(dashboardId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["share", dashboardId] }); toast("Share link created"); },
    onError: () => toast("Couldn't create the link", "error"),
  });
  const revoke = useMutation({
    mutationFn: () => Dashboards.revokeShare(dashboardId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["share", dashboardId] }); toast("Share link revoked"); },
    onError: () => toast("Couldn't revoke the link", "error"),
  });

  const link = share.data ? `${typeof window !== "undefined" ? window.location.origin : ""}${share.data.url_path}` : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast("Couldn't copy — select and copy manually", "error");
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      icon={Share2}
      title="Share this dashboard"
      description="Anyone with the link can view this dashboard — no account needed. They can filter but not edit."
      footer={<Button variant="ghost" onClick={onClose}>Done</Button>}
    >
      <div className="space-y-4">
        {share.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400"><Spinner size={15} /> Loading…</div>
        ) : share.data ? (
          <>
            <div className="flex items-center gap-2">
              <input readOnly value={link} aria-label="Public share link" className={`${inputClass} font-mono text-xs`} onFocus={(e) => e.target.select()} />
              <button onClick={copy} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-700">
                {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button onClick={() => revoke.mutate()} disabled={revoke.isPending} className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50">
              <Trash2 size={14} /> Revoke this link
            </button>
          </>
        ) : (
          <div>
            <p className="text-sm text-slate-500">No public link yet. Create one to share a view-only version with stakeholders.</p>
            <Button onClick={() => create.mutate()} disabled={create.isPending} className="mt-3">
              {create.isPending ? "Creating…" : "Create share link"}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function TileCard({ tile, result, editing, loading, onDelete }: { tile: DashboardTile; result?: QueryResult; editing: boolean; loading: boolean; onDelete: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className={`flex items-center justify-between border-b border-slate-100 px-3 py-2 ${editing ? "tile-drag cursor-move" : ""}`}>
        <div className="flex items-center gap-1.5">
          {editing && <GripVertical size={14} className="text-slate-300" />}
          <span className="truncate text-sm font-semibold text-brand-950">{tile.title}</span>
        </div>
        {editing && <button onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Remove tile" className="text-slate-300 hover:text-red-600">✕</button>}
      </div>
      <div className="min-h-0 flex-1 p-3">
        {loading && <p className="text-sm text-slate-400">Loading…</p>}
        {result && <div className="h-full"><ChartView vizType={tile.viz_type ?? "table"} encoding={tile.encoding ?? {}} result={result} height="100%" /></div>}
      </div>
    </div>
  );
}

function PropertiesPanel({ tile, columns, onClose, onSaved }: { tile: DashboardTile; columns: string[]; onClose: () => void; onSaved: () => void }) {
  const [viz, setViz] = useState(tile.viz_type ?? "column");
  const [title, setTitle] = useState(tile.title ?? "");
  const enc = (tile.encoding ?? {}) as unknown as Encoding;
  const [x, setX] = useState(enc.x ?? columns[0] ?? "");
  const [y, setY] = useState(enc.y ?? columns[1] ?? "");
  const [lat, setLat] = useState(enc.lat ?? columns.find((c) => /lat/i.test(c)) ?? columns[0] ?? "");
  const [lon, setLon] = useState(enc.lon ?? columns.find((c) => /lon|lng/i.test(c)) ?? columns[1] ?? "");
  const [value, setValue] = useState(enc.value ?? columns[1] ?? "");
  const isGeo = viz === "geomap";

  const save = useMutation({
    mutationFn: () =>
      Charts.update(tile.chart_id!, {
        name: title || undefined,
        viz_type: viz,
        spec: isGeo ? { lat, lon, value, label: x } : { x, y },
      }),
    onSuccess: onSaved,
  });

  // Live apply — like Looker Studio, edits take effect as you make them
  // (debounced), so there's no separate "Apply" step to forget.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(() => save.mutate(), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viz, x, y, lat, lon, value, title]);

  const sel = (val: string, set: (v: string) => void) => (
    <select value={val} onChange={(e) => set(e.target.value)} className={inputClass}>
      {columns.map((c) => <option key={c}>{c}</option>)}
    </select>
  );

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={14} className="text-brand-600" />
          <span className="text-sm font-bold text-brand-950">Properties</span>
        </div>
        <button onClick={onClose} title="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={16} /></button>
      </div>

      <div className="flex-1 space-y-6 overflow-auto p-4">
        {/* Setup */}
        <section>
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <span className="grid h-4 w-4 place-items-center rounded bg-brand-50 text-[9px] font-bold text-brand-600">1</span> Data · Setup
          </div>
          <div className="space-y-4">
            {isGeo ? (
              <>
                <Field label="Latitude">{sel(lat, setLat)}</Field>
                <Field label="Longitude">{sel(lon, setLon)}</Field>
                <Field label="Value">{sel(value, setValue)}</Field>
                <Field label="Label">{sel(x, setX)}</Field>
              </>
            ) : (
              <>
                <Field label="Dimension (X)">{sel(x, setX)}</Field>
                <Field label="Metric (Y)">{sel(y, setY)}</Field>
              </>
            )}
          </div>
        </section>

        {/* Style */}
        <section className="border-t border-slate-100 pt-5">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <span className="grid h-4 w-4 place-items-center rounded bg-brand-50 text-[9px] font-bold text-brand-600">2</span> Style
          </div>
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 text-xs font-medium text-slate-600">Chart type</div>
              <div className="grid grid-cols-4 gap-1.5">
                {VIZ_TYPES.map((v) => {
                  const Icon = VIZ_ICONS[v] ?? BarChart3;
                  const active = viz === v;
                  return (
                    <button
                      key={v}
                      onClick={() => setViz(v)}
                      title={v}
                      className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2.5 text-[10px] capitalize transition ${active ? "border-brand-500 bg-brand-50 text-brand-700 shadow-sm" : "border-slate-200 text-slate-500 hover:border-brand-300 hover:bg-slate-50"}`}
                    >
                      <Icon size={16} className={active ? "text-brand-600" : "text-slate-400"} />
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>
            <Field label="Title">
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="Chart title" />
            </Field>
          </div>
        </section>

        {/* Source — quick jump to edit the underlying query */}
        {tile.chart_id && (
          <section className="border-t border-slate-100 pt-5">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <span className="grid h-4 w-4 place-items-center rounded bg-brand-50 text-[9px] font-bold text-brand-600">3</span> Source
            </div>
            <Link
              href={`/sql?chart=${tile.chart_id}`}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Pencil size={14} /> Edit query in SQL editor
            </Link>
          </section>
        )}
      </div>

      <div className="flex items-center gap-1.5 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
        {save.isPending ? (
          <><Loader2 size={13} className="animate-spin text-brand-500" /> Applying…</>
        ) : save.isSuccess ? (
          <><Check size={13} className="text-emerald-500" /> Changes saved</>
        ) : (
          <>Edits apply automatically</>
        )}
      </div>
    </div>
  );
}
