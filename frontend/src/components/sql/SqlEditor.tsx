"use client";

import Editor from "@monaco-editor/react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bookmark, ChevronDown, ChevronRight, Columns3, Database, FolderOpen, Loader2, Pencil, Play, Save, Table2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { ApiError, Charts, Datasets, Queries, type Chart, type Dataset, type QueryResult } from "@/lib/api";
import { useProject } from "@/lib/project";
import { DataTable } from "@/components/charts/DataTable";
import { registerSqlCompletion, sqlCatalog } from "@/lib/sqlCompletion";
import { useToast } from "@/lib/toast";
import { usePrompt } from "@/lib/confirm";
import { useTheme } from "@/lib/theme";
import { defineUspDark, monacoTheme } from "@/lib/monacoTheme";

const VIZ = ["column", "bar", "line", "area", "pie", "scatter", "bubble", "histogram", "map", "geomap", "table"];

export function SqlEditor() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const prompt = usePrompt();
  const { resolved } = useTheme();
  const { activeId: workspaceId } = useProject();
  const datasets = useQuery({
    queryKey: ["datasets", workspaceId],
    queryFn: () => Datasets.list(workspaceId),
    enabled: !!workspaceId,
  });
  const saved = useQuery({
    queryKey: ["queries", workspaceId],
    queryFn: () => Queries.list(workspaceId),
    enabled: !!workspaceId,
  });

  // Editing an existing chart's query? (?chart=<id>) Load it and switch to update mode.
  const router = useRouter();
  const searchParams = useSearchParams();
  const chartId = searchParams.get("chart");
  const editingChart = useQuery({
    queryKey: ["chart", chartId],
    queryFn: () => Charts.get(chartId!),
    enabled: !!chartId,
  });

  // Group the catalog into schema ▸ table so it's obvious where each table comes from.
  const schemas = useMemo(() => {
    const out: Record<string, Dataset[]> = {};
    for (const d of datasets.data ?? []) (out[d.schema_name] ??= []).push(d);
    return out;
  }, [datasets.data]);

  // Fetch every table's columns so the SQL editor can autocomplete them.
  const details = useQueries({
    queries: (datasets.data ?? []).map((d) => ({
      queryKey: ["dataset", d.id],
      queryFn: () => Datasets.get(d.id),
      staleTime: 5 * 60 * 1000,
    })),
  });
  const catalogSig = (datasets.data ?? []).map((d, i) => `${d.slug}:${details[i]?.data?.columns.length ?? 0}`).join("|");
  useEffect(() => {
    sqlCatalog.tables = (datasets.data ?? []).map((d, i) => ({
      qualified: `${d.schema_name}.${d.slug}`,
      columns: details[i]?.data?.columns.map((c) => c.name) ?? [],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogSig]);

  const [sql, setSql] = useState("");
  const [focused, setFocused] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"data" | "messages">("data");
  const [panel, setPanel] = useState<"datasets" | "saved">("datasets");
  const [saveChartOpen, setSaveChartOpen] = useState(false);

  const run = useMutation<QueryResult, ApiError, string | void>({
    mutationFn: (q) => Queries.run(typeof q === "string" ? q : sql),
    onSuccess: (r) => {
      setResult(r);
      setError(null);
      setTab("data");
    },
    onError: (e) => {
      setError(e.message);
      setTab("messages");
      toast("Query failed — see Messages", "error");
    },
  });

  // When a chart loads for editing, seed the editor with its query, open the chart
  // panel, and run it once so the preview + fields are ready.
  const seeded = useRef(false);
  useEffect(() => {
    if (editingChart.data && !seeded.current) {
      seeded.current = true;
      setSql(editingChart.data.sql);
      setSaveChartOpen(true);
      run.mutate(editingChart.data.sql);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingChart.data]);

  const saveQuery = useMutation({
    mutationFn: (name: string) => Queries.save(workspaceId!, name, sql),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["queries"] }); toast("Query saved"); },
    onError: () => toast("Couldn't save the query", "error"),
  });

  const onSaveQuery = async () => {
    const fallback = `Untitled query ${(saved.data?.length ?? 0) + 1}`;
    const name = await prompt({ title: "Save query", label: "Query name", placeholder: fallback, defaultValue: fallback, confirmLabel: "Save query" });
    if (name) saveQuery.mutate(name);
  };

  return (
    <div className="flex h-[calc(100vh-5.5rem)] flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div>
          {editingChart.data ? (
            <>
              <Link href="/charts" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-700">
                <ArrowLeft size={13} /> All charts
              </Link>
              <h1 className="mt-0.5 flex items-center gap-2 text-xl font-extrabold tracking-tight text-brand-950">
                <Pencil size={16} className="text-brand-600" /> Editing chart · {editingChart.data.name}
              </h1>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-600">
                <span className="text-azure">✦</span> SQL Editor
              </div>
              <h1 className="text-xl font-extrabold tracking-tight text-brand-950">Query Tool</h1>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => run.mutate()}
            disabled={run.isPending || !sql.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {run.isPending ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} {run.isPending ? "Running…" : "Run"}
          </button>
          <button
            onClick={onSaveQuery}
            disabled={!sql.trim() || !workspaceId}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <Bookmark size={15} /> Save query
          </button>
          <button
            onClick={() => setSaveChartOpen((s) => !s)}
            disabled={!result}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <Save size={15} /> Save as chart
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 pt-3">
        {/* Object browser */}
        <aside className="flex w-60 shrink-0 flex-col rounded-xl border border-slate-200 bg-white">
          <div className="flex border-b border-slate-100 text-xs font-semibold">
            <button
              onClick={() => setPanel("datasets")}
              className={`flex-1 px-3 py-2 ${panel === "datasets" ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-400"}`}
            >
              Datasets
            </button>
            <button
              onClick={() => setPanel("saved")}
              className={`flex-1 px-3 py-2 ${panel === "saved" ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-400"}`}
            >
              Saved
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {panel === "datasets" && (
              <div className="text-sm">
                <div className="flex items-center gap-1.5 px-1.5 py-1 font-semibold text-brand-950">
                  <Database size={14} className="text-brand-600" /> main
                </div>
                {Object.entries(schemas).map(([schema, tables]) => (
                  <div key={schema} className="ml-1.5">
                    <div className="flex items-center gap-1.5 px-1.5 py-1 text-slate-500">
                      <FolderOpen size={14} className="text-azure" />
                      <span className="font-medium">{schema}</span>
                      <span className="ml-auto rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">{tables.length}</span>
                    </div>
                    {tables.map((d) => (
                      <SqlTableNode key={d.id} dataset={d} onInsert={(q) => setSql((s) => (s.trim() ? s : q))} />
                    ))}
                  </div>
                ))}
                {datasets.isSuccess && (datasets.data?.length ?? 0) === 0 && (
                  <p className="px-2 py-3 text-xs text-slate-400">No tables yet — add a source in Data Services.</p>
                )}
              </div>
            )}
            {panel === "saved" &&
              (saved.data?.length ? (
                saved.data.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => setSql(q.sql)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-brand-50"
                  >
                    <Bookmark size={13} className="shrink-0 text-brand-500" />
                    <span className="truncate">{q.name}</span>
                  </button>
                ))
              ) : (
                <p className="px-2 py-3 text-xs text-slate-400">No saved queries yet.</p>
              ))}
          </div>
        </aside>

        {/* Editor + results (vertical split) */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="relative h-[40%] min-h-[150px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
            <Editor
              height="100%"
              defaultLanguage="pgsql"
              theme={monacoTheme(resolved)}
              value={sql}
              onChange={(v) => setSql(v ?? "")}
              beforeMount={(monaco) => defineUspDark(monaco)}
              onMount={(editor, monaco) => {
                registerSqlCompletion(monaco);
                editor.onDidFocusEditorText(() => setFocused(true));
                editor.onDidBlurEditorText(() => setFocused(false));
              }}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                wordWrap: "on",
                scrollBeyondLastLine: false,
                padding: { top: 12 },
                renderLineHighlight: "none",
                overviewRulerLanes: 0,
                overviewRulerBorder: false,
                hideCursorInOverviewRuler: true,
                scrollbar: { useShadows: false, verticalScrollbarSize: 8, horizontalScrollbarSize: 8, alwaysConsumeMouseWheel: false },
                guides: { indentation: false },
                fixedOverflowWidgets: true,
                inlineSuggest: { enabled: true },
                quickSuggestions: false,
                suggestOnTriggerCharacters: false,
                tabCompletion: "on",
              }}
            />
            {!sql && !focused && (
              <div className="pointer-events-none absolute left-[62px] top-3 font-mono text-sm text-slate-400">
                SELECT * FROM your_dataset LIMIT 100
              </div>
            )}
          </div>

          {saveChartOpen && result && workspaceId && (
            <SaveChart
              workspaceId={workspaceId}
              sql={sql}
              columns={result.columns}
              chart={editingChart.data}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: ["charts"] });
                if (editingChart.data) {
                  qc.invalidateQueries({ queryKey: ["chart", editingChart.data.id] });
                  qc.invalidateQueries({ queryKey: ["chart-data", editingChart.data.id] });
                  router.push("/charts");
                } else {
                  setSaveChartOpen(false);
                }
              }}
            />
          )}

          {/* Results panel with pgAdmin-style tabs */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
            <div className="flex items-center gap-1 border-b border-slate-100 px-2 text-xs font-semibold">
              <button
                onClick={() => setTab("data")}
                className={`flex items-center gap-1.5 px-3 py-2 ${tab === "data" ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-400"}`}
              >
                <Table2 size={13} /> Data Output {result ? `(${result.row_count})` : ""}
              </button>
              <button
                onClick={() => setTab("messages")}
                className={`px-3 py-2 ${tab === "messages" ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-400"}`}
              >
                Messages
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3">
              {tab === "data" ? (
                result ? (
                  <DataTable result={result} maxHeight="h-full" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    Run a query to see results.
                  </div>
                )
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-xs text-slate-600">
                  {error ? error : run.isSuccess ? `Query returned ${result?.row_count ?? 0} rows.` : "No messages."}
                </pre>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SqlTableNode({ dataset, onInsert }: { dataset: Dataset; onInsert: (q: string) => void }) {
  const [open, setOpen] = useState(false);
  const qualified = `${dataset.schema_name}.${dataset.slug}`;
  const detail = useQuery({
    queryKey: ["dataset", dataset.id],
    queryFn: () => Datasets.get(dataset.id),
    enabled: open,
  });

  return (
    <div className="ml-1.5">
      <div className="group flex items-center gap-1 rounded-md pr-1 hover:bg-brand-50">
        <button onClick={() => setOpen((o) => !o)} title={open ? "Hide columns" : "Show columns"} className="shrink-0 rounded p-1 text-slate-400 hover:text-brand-600">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <button
          onClick={() => onInsert(`SELECT * FROM ${qualified} LIMIT 100`)}
          title={`Insert query for ${qualified}`}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-slate-700"
        >
          <Table2 size={13} className="shrink-0 text-slate-400" />
          <span className="truncate">{dataset.name}</span>
        </button>
      </div>
      {open && (
        <div className="ml-[18px] mt-0.5 space-y-px border-l border-slate-100 pl-2">
          {detail.isLoading && <p className="px-1.5 py-1 text-[11px] text-slate-400">Loading…</p>}
          {detail.data?.columns.map((c) => (
            <div key={c.name} className="flex items-center gap-2 rounded px-1.5 py-0.5">
              <Columns3 size={11} className="shrink-0 text-slate-300" />
              <span className="min-w-0 flex-1 truncate text-[12px] text-slate-600">{c.name}</span>
              <span className="shrink-0 font-mono text-[10px] uppercase text-azure">{c.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SaveChart({
  workspaceId,
  sql,
  columns,
  chart,
  onSaved,
}: {
  workspaceId: string;
  sql: string;
  columns: string[];
  chart?: Chart;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const spec = (chart?.spec ?? {}) as Record<string, string | undefined>;
  const isEditing = !!chart;
  const [name, setName] = useState(chart?.name ?? "");
  const [viz, setViz] = useState(chart?.viz_type ?? "column");
  const [x, setX] = useState(spec.x ?? columns[0] ?? "");
  const [y, setY] = useState(spec.y ?? columns[1] ?? columns[0] ?? "");
  const [lat, setLat] = useState(spec.lat ?? columns.find((c) => /lat/i.test(c)) ?? columns[0] ?? "");
  const [lon, setLon] = useState(spec.lon ?? columns.find((c) => /lon|lng/i.test(c)) ?? columns[1] ?? "");
  const [value, setValue] = useState(spec.value ?? columns.find((c) => /case|count|value|total|visit|rate/i.test(c)) ?? columns[0] ?? "");
  const isGeo = viz === "geomap";

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: name || "Untitled chart",
        sql,
        viz_type: viz,
        spec: isGeo ? { lat, lon, value, label: x } : { x, y },
      };
      return isEditing ? Charts.update(chart!.id, payload) : Charts.create({ workspace_id: workspaceId, ...payload });
    },
    onSuccess: () => { toast(isEditing ? "Chart updated" : "Chart saved"); onSaved(); },
    onError: () => toast(isEditing ? "Couldn't update the chart" : "Couldn't save the chart", "error"),
  });

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-3 dark:border-brand-500/30 dark:bg-brand-500/10">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
        {isEditing ? <Pencil size={12} /> : <Save size={12} />} {isEditing ? "Update chart" : "Save as chart"}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Col label="Chart name">
          <input className="w-44 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Untitled chart" />
        </Col>
        <Col label="Type">
          <select className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={viz} onChange={(e) => setViz(e.target.value)}>
            {VIZ.map((v) => <option key={v}>{v}</option>)}
          </select>
        </Col>
        {isGeo ? (
          <>
            <Col label="Latitude"><ColSelect value={lat} onChange={setLat} columns={columns} /></Col>
            <Col label="Longitude"><ColSelect value={lon} onChange={setLon} columns={columns} /></Col>
            <Col label="Value"><ColSelect value={value} onChange={setValue} columns={columns} /></Col>
          </>
        ) : (
          <>
            <Col label="X / label"><ColSelect value={x} onChange={setX} columns={columns} /></Col>
            <Col label="Y / value"><ColSelect value={y} onChange={setY} columns={columns} /></Col>
          </>
        )}
        <button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {save.isPending ? (isEditing ? "Updating…" : "Saving…") : isEditing ? "Update chart" : "Save chart"}
        </button>
      </div>
    </div>
  );
}

function Col({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-500">
      {label}
      {children}
    </label>
  );
}

function ColSelect({ value, onChange, columns }: { value: string; onChange: (v: string) => void; columns: string[] }) {
  return (
    <select className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      {columns.map((c) => <option key={c}>{c}</option>)}
    </select>
  );
}
