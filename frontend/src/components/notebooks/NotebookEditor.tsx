"use client";

import Editor from "@monaco-editor/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Database, Download, Eraser, Loader2, Pencil, Play, Plus, RotateCcw, Square, Trash2, Type } from "lucide-react";
import Link from "next/link";
import { memo, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

import { Datasets, Notebooks, type CellOutput, type NotebookCell, type NotebookDetail } from "@/lib/api";
import { downloadNotebook } from "@/lib/ipynb";
import { useToast } from "@/lib/toast";
import { useTheme } from "@/lib/theme";
import { defineUspDark, monacoTheme } from "@/lib/monacoTheme";
import { CellOutputs } from "./CellOutputs";

// usp helpers + common pandas, offered as autocomplete in every code cell.
const PY_SNIPPETS = [
  { label: "load_dataset", insert: "df = load_dataset('${1:slug}')\ndf.head()", doc: "Load a dataset into a pandas DataFrame" },
  { label: "save_dataset", insert: "save_dataset(${1:df}, '${2:My dataset}')", doc: "Save a DataFrame back to the catalog" },
  { label: "save_chart", insert: "save_chart(${1:df}, '${2:My chart}', '${3:column}', '${4:x_col}', '${5:y_col}')", doc: "Save a chart you can add to a dashboard" },
];
const PY_PANDAS = ["df.head()", "df.describe()", "df.info()", "df.columns", "df.shape", "df.groupby()", "df.sort_values()", "df.merge()", "df.dropna()", "df.fillna()", "import pandas as pd", "import matplotlib.pyplot as plt"];

// Shared list of dataset slugs the completion provider reads from.
const nbDatasetSlugs: { slugs: string[] } = { slugs: [] };
let pyProviderRegistered = false;

function pyCandidates(): string[] {
  return [...PY_SNIPPETS.map((s) => s.label), ...nbDatasetSlugs.slugs, ...PY_PANDAS];
}

function registerPythonCompletion(monaco: any) {
  if (pyProviderRegistered) return;
  pyProviderRegistered = true;
  // Inline ghost-text prediction (primary) — type, see the rest greyed out, Tab to accept.
  monaco.languages.registerInlineCompletionsProvider("python", {
    provideInlineCompletions(model: any, position: any) {
      const line = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const m = line.match(/([A-Za-z_][A-Za-z0-9_.()*]*)$/);
      if (!m) return { items: [] };
      const prefix = m[1];
      if (prefix.length < 2) return { items: [] };
      const lower = prefix.toLowerCase();
      const hit = pyCandidates().find((c) => c.length > prefix.length && c.toLowerCase().startsWith(lower));
      if (!hit) return { items: [] };
      const range = new monaco.Range(position.lineNumber, position.column - prefix.length, position.lineNumber, position.column);
      return { items: [{ insertText: hit, range }] };
    },
    freeInlineCompletions() {},
  });
  // Full list incl. snippet templates, still available on demand via Ctrl+Space.
  monaco.languages.registerCompletionItemProvider("python", {
    triggerCharacters: ["'", '"', "."],
    provideCompletionItems(model: any, position: any) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const suggestions: any[] = [];
      for (const s of PY_SNIPPETS) {
        suggestions.push({
          label: s.label,
          kind: monaco.languages.CompletionItemKind.Function,
          detail: "usp helper",
          documentation: s.doc,
          insertText: s.insert,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        });
      }
      for (const slug of nbDatasetSlugs.slugs) {
        suggestions.push({ label: slug, kind: monaco.languages.CompletionItemKind.Value, detail: "dataset", insertText: slug, range });
      }
      for (const p of PY_PANDAS) {
        suggestions.push({ label: p, kind: monaco.languages.CompletionItemKind.Method, insertText: p, range });
      }
      return { suggestions };
    },
  });
}

export function NotebookEditor({ notebookId }: { notebookId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const nb = useQuery({ queryKey: ["notebook", notebookId], queryFn: () => Notebooks.get(notebookId) });
  const workspaceId = nb.data?.workspace_id;
  const datasets = useQuery({
    queryKey: ["datasets", workspaceId],
    queryFn: () => Datasets.list(workspaceId),
    enabled: !!workspaceId,
  });

  // Feed dataset slugs to the Python autocomplete provider.
  useEffect(() => {
    nbDatasetSlugs.slugs = datasets.data?.map((d) => d.slug) ?? [];
  }, [datasets.data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["notebook", notebookId] });
  const addCell = useMutation({
    mutationFn: ({ cellType, after }: { cellType: "code" | "markdown"; after?: number }) => Notebooks.addCell(notebookId, cellType, after),
    onSuccess: invalidate,
  });
  const restart = useMutation({
    mutationFn: () => Notebooks.restart(notebookId),
    onSuccess: () => toast("Kernel restarted"),
    onError: () => toast("Couldn't restart the kernel", "error"),
  });
  const insert = useMutation({
    mutationFn: async (code: string) => {
      const cell = await Notebooks.addCell(notebookId);
      return Notebooks.updateCell(notebookId, cell.id, code);
    },
    onSuccess: invalidate,
  });

  if (nb.isLoading) return <p className="text-slate-400">Loading…</p>;
  if (!nb.data) return <p className="text-slate-400">Notebook not found.</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/notebooks" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-700">
            <ArrowLeft size={15} /> Notebooks
          </Link>
          <h1 className="text-xl font-extrabold tracking-tight text-brand-950">{nb.data.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Kernel connected
          </span>
          <button onClick={() => { downloadNotebook(nb.data!); toast("Notebook downloaded (.ipynb)"); }} title="Download as Jupyter notebook (.ipynb)" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            <Download size={13} /> Download
          </button>
          <button onClick={() => restart.mutate()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            <RotateCcw size={13} /> Restart
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[248px_minmax(0,1fr)]">
        {/* Explorer */}
        <aside>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Datasets</span>
              <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-medium text-slate-500">{datasets.data?.length ?? 0}</span>
            </div>
            <div className="space-y-0.5 p-2">
              {datasets.data?.map((d) => (
                <button
                  key={d.id}
                  onClick={() => insert.mutate(`df = load_dataset('${d.slug}')\ndf.head()`)}
                  title={`Insert load_dataset('${d.slug}')`}
                  className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-brand-50"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-600 transition group-hover:bg-white">
                    <Database size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-slate-800">{d.name}</span>
                    <code className="block truncate text-[11px] text-slate-400">{d.slug}</code>
                  </span>
                  <Plus size={14} className="shrink-0 text-slate-300 opacity-0 transition group-hover:opacity-100" />
                </button>
              ))}
              {datasets.data?.length === 0 && <p className="px-2 py-3 text-center text-xs text-slate-400">No datasets in this project.</p>}
            </div>
          </div>
        </aside>

        {/* Cells */}
        <div>
          <div className="max-w-5xl">
            {nb.data.cells.length === 0 ? (
              <div className="flex gap-2">
                <button
                  onClick={() => addCell.mutate({ cellType: "code" })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-brand-400 hover:text-brand-700"
                >
                  <Plus size={14} /> Code
                </button>
                <button
                  onClick={() => addCell.mutate({ cellType: "markdown" })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-brand-400 hover:text-brand-700"
                >
                  <Type size={14} /> Text
                </button>
              </div>
            ) : (
              nb.data.cells.map((cell) => (
                <div key={cell.id}>
                  <CellView notebookId={notebookId} workspaceId={nb.data!.workspace_id} cell={cell} />
                  <InsertBar onAdd={(t) => addCell.mutate({ cellType: t, after: cell.position })} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Hover affordance between cells — insert a code or text cell at this spot. */
function InsertBar({ onAdd }: { onAdd: (t: "code" | "markdown") => void }) {
  return (
    <div className="group/insert relative flex h-7 items-center justify-center">
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-200 opacity-0 transition group-hover/insert:opacity-100" />
      <div className="relative flex items-center gap-1.5 opacity-0 transition group-hover/insert:opacity-100">
        <button onClick={() => onAdd("code")} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 shadow-sm transition hover:border-brand-300 hover:text-brand-700">
          <Plus size={11} /> Code
        </button>
        <button onClick={() => onAdd("markdown")} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 shadow-sm transition hover:border-brand-300 hover:text-brand-700">
          <Type size={11} /> Text
        </button>
      </div>
    </div>
  );
}

const CellView = memo(
  CellViewBase,
  (a, b) =>
    a.notebookId === b.notebookId &&
    a.workspaceId === b.workspaceId &&
    a.cell.id === b.cell.id &&
    a.cell.cell_type === b.cell.cell_type &&
    a.cell.source === b.cell.source &&
    a.cell.execution_count === b.cell.execution_count &&
    JSON.stringify(a.cell.outputs) === JSON.stringify(b.cell.outputs),
);

function CellViewBase({ notebookId, workspaceId, cell }: { notebookId: string; workspaceId: string; cell: NotebookCell }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { resolved } = useTheme();
  const [source, setSource] = useState(cell.source);
  useEffect(() => setSource(cell.source), [cell.source]);

  // Live stdout streamed from the kernel while a cell runs (null = not running).
  const [liveOut, setLiveOut] = useState<string | null>(null);
  const liveRef = useRef("");
  // Lets Stop end the client-side stream immediately (the kernel halts on its own time).
  const abortRef = useRef<AbortController | null>(null);

  const save = useMutation({ mutationFn: (s: string) => Notebooks.updateCell(notebookId, cell.id, s) });
  const run = useMutation({
    mutationFn: async (): Promise<NotebookCell | null> => {
      await Notebooks.updateCell(notebookId, cell.id, source);
      liveRef.current = "";
      setLiveOut(""); // show the live block immediately, even before the first print
      const controller = new AbortController();
      abortRef.current = controller;
      let finalCell: NotebookCell | null = null;
      const finalize = (outputs: CellOutput[]): NotebookCell => ({
        ...cell,
        source,
        outputs,
        execution_count: (cell.execution_count ?? 0) + 1,
      });
      try {
        await Notebooks.runCellStream(
          notebookId,
          cell.id,
          (f) => {
            if (f.type === "stream") {
              liveRef.current += f.text;
              setLiveOut(liveRef.current);
            } else if (f.type === "done") {
              const outputs: CellOutput[] = [];
              if (f.stdout) outputs.push({ type: "stdout", text: f.stdout });
              outputs.push(...(f.outputs ?? []));
              finalCell = finalize(outputs);
            }
          },
          controller.signal,
        );
      } catch (e) {
        // Stop was clicked → we aborted the stream. Don't wait on the server;
        // resolve right now with whatever streamed so far + a stopped marker.
        if (controller.signal.aborted) {
          const outputs: CellOutput[] = [];
          if (liveRef.current) outputs.push({ type: "stdout", text: liveRef.current });
          outputs.push({ type: "error", text: "KeyboardInterrupt: execution interrupted by user" });
          finalCell = finalize(outputs);
        } else {
          throw e;
        }
      } finally {
        abortRef.current = null;
      }
      return finalCell;
    },
    // Patch just this cell in the cache (no full refetch) so the page doesn't
    // re-render every cell and jump when you run one.
    onSuccess: (updated) => {
      if (updated)
        qc.setQueryData<NotebookDetail>(["notebook", notebookId], (old) =>
          old ? { ...old, cells: old.cells.map((c) => (c.id === cell.id ? updated : c)) } : old,
        );
      setLiveOut(null);
    },
    onError: () => {
      setLiveOut(null);
      toast("Couldn't run the cell", "error");
    },
  });
  // Stop a running cell: tell the kernel to halt AND end the client stream right
  // away (aborting it makes `run` resolve immediately with the output so far, so
  // the UI doesn't sit spinning while the kernel/connection wind down).
  const interrupt = useMutation({
    mutationFn: () => Notebooks.interrupt(notebookId),
    onError: () => toast("Couldn't stop the cell", "error"),
  });
  const stop = () => {
    interrupt.mutate();
    abortRef.current?.abort();
  };
  const clear = useMutation({
    mutationFn: () => Notebooks.clearCell(notebookId, cell.id),
    onSuccess: (updated) =>
      qc.setQueryData<NotebookDetail>(["notebook", notebookId], (old) =>
        old ? { ...old, cells: old.cells.map((c) => (c.id === cell.id ? updated : c)) } : old,
      ),
    onError: () => toast("Couldn't clear the output", "error"),
  });
  const del = useMutation({
    mutationFn: () => Notebooks.deleteCell(notebookId, cell.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notebook", notebookId] }); toast("Cell deleted"); },
    onError: () => toast("Couldn't delete the cell", "error"),
  });

  // Keep a live trigger for the Monaco keybindings (avoids stale closures).
  const runRef = useRef<() => void>(() => {});
  runRef.current = () => { if (!run.isPending) run.mutate(); };

  if (cell.cell_type === "markdown") {
    return <MarkdownCell source={source} setSource={setSource} onSave={() => save.mutate(source)} onDelete={() => del.mutate()} />;
  }

  // Grow the cell to fit every line (incl. the trailing one you just added with
  // Enter) so the editor expands downward instead of scrolling inside and hiding
  // the top. A generous max keeps a pasted novel from running away.
  const lines = Math.max(1, source.split("\n").length);
  const editorHeight = Math.min(Math.max(lines * 20 + 28, 56), 2000);

  return (
    <div>
      <div className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card transition focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-200 focus-within:shadow-lift dark:focus-within:border-brand-500/60 dark:focus-within:ring-brand-500/40">
      <div className="flex items-stretch">
        <div className="flex w-12 shrink-0 items-start justify-center border-r border-slate-100 bg-slate-50/70 pt-3.5 transition group-focus-within:bg-brand-50 dark:bg-white/5 dark:group-focus-within:bg-brand-500/25">
          <button
            onClick={() => (run.isPending ? stop() : run.mutate())}
            title={
              run.isPending
                ? "Stop cell"
                : `Run cell (Shift+Enter)${cell.execution_count ? ` · last run [${cell.execution_count}]` : ""}`
            }
            className={`relative grid h-7 w-7 place-items-center rounded-full text-white transition ${
              run.isPending ? "bg-brand-600 hover:bg-rose-600" : "bg-brand-600 hover:bg-brand-700"
            }`}
          >
            {run.isPending ? (
              <>
                {/* Spinner ring rotating around a stop square — click to interrupt. */}
                <Loader2 size={26} className="absolute animate-spin opacity-80" />
                <Square size={9} strokeWidth={0} className="relative fill-current" />
              </>
            ) : (
              <Play size={14} />
            )}
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <Editor
            height={`${editorHeight}px`}
            defaultLanguage="python"
            theme={monacoTheme(resolved)}
            value={source}
            onChange={(v) => setSource(v ?? "")}
            beforeMount={(monaco) => defineUspDark(monaco)}
            onMount={(editor, monaco) => {
              registerPythonCompletion(monaco);
              // Run with Shift+Enter or Cmd/Ctrl+Enter, like Colab/Jupyter.
              // addAction reliably binds editor-scoped keybindings (addCommand can be swallowed).
              editor.addAction({
                id: "usp-run-cell",
                label: "Run cell",
                keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.Enter, monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
                run: () => runRef.current(),
              });
              editor.onDidBlurEditorText(() => save.mutate(source));
            }}
            options={{
              minimap: { enabled: false },
              fontSize: 13.5,
              lineHeight: 20,
              scrollBeyondLastLine: false,
              lineNumbers: "off",
              padding: { top: 14, bottom: 14 },
              folding: false,
              renderLineHighlight: "all",
              renderLineHighlightOnlyWhenFocus: true,
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
        </div>
        <button onClick={() => del.mutate()} title="Delete cell" className="self-start p-2.5 text-slate-300 opacity-0 transition hover:text-red-600 group-hover:opacity-100">
          <Trash2 size={13} />
        </button>
      </div>
      </div>

      {/* Output — a separate block below the code cell, aligned under the editor (VS Code-style).
          While running we show stdout LIVE as it streams in; when the run finishes the
          authoritative outputs (incl. tables/images/errors) replace it. Between runs we keep
          the last outputs so the height stays stable and the page doesn't jump. */}
      {run.isPending && liveOut !== null ? (
        <div className="ml-12 mt-1.5">
          <LiveOutput text={liveOut} />
        </div>
      ) : cell.outputs?.length > 0 ? (
        <div className="group/out relative ml-12 mt-1.5">
          <button
            onClick={() => clear.mutate()}
            title="Clear output"
            className="absolute -top-2 right-1 z-10 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-400 opacity-0 shadow-sm transition hover:text-red-600 group-hover/out:opacity-100 dark:border-white/10"
          >
            <Eraser size={12} /> Clear
          </button>
          <CellOutputs outputs={cell.outputs} workspaceId={workspaceId} />
        </div>
      ) : null}
    </div>
  );
}

/** Live, growing stdout shown while a cell is still running. Styled to match
    CellOutputs' stdout block so the swap to final output is seamless. */
function LiveOutput({ text }: { text: string }) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-card dark:border-white/10 dark:bg-white/[0.03]">
      {text ? (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap px-1 font-mono text-xs leading-relaxed text-slate-700">
          {text}
        </pre>
      ) : null}
      <div className="inline-flex items-center gap-2 px-1 text-xs text-slate-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
        Running… click the stop button to interrupt
      </div>
    </div>
  );
}

function MarkdownCell({
  source,
  setSource,
  onSave,
  onDelete,
}: {
  source: string;
  setSource: (s: string) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(!source);

  if (editing) {
    return (
      <div className="overflow-hidden rounded-xl border border-brand-300 bg-white shadow-card ring-1 ring-brand-500/10">
        <div className="grid md:grid-cols-2">
          <textarea
            autoFocus
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onBlur={() => onSave()}
            placeholder="# Heading&#10;&#10;Write **markdown** here — lists, `code`, [links](url)…"
            className="min-h-[150px] w-full resize-y border-0 p-4 font-mono text-[13px] leading-relaxed text-slate-700 focus:outline-none md:border-r md:border-slate-100"
          />
          <div className="min-h-[150px] overflow-auto bg-slate-50/50 p-4 dark:bg-white/5">
            <div className="md-content">
              <ReactMarkdown>{source || "_Live preview…_"}</ReactMarkdown>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-1.5">
          <span className="text-[11px] text-slate-400">Markdown — <code className="text-brand-600"># Heading</code> needs a space · <code className="text-brand-600">**bold**</code> · <code className="text-brand-600">- list</code></span>
          <div className="flex items-center gap-2">
            <button onClick={onDelete} className="rounded p-1 text-slate-400 hover:text-red-600"><Trash2 size={13} /></button>
            <button onClick={() => { onSave(); setEditing(false); }} className="rounded-md bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700">Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative rounded-xl border border-transparent px-3 py-2 transition hover:border-slate-200 hover:bg-white" onDoubleClick={() => setEditing(true)}>
      <div className="md-content">
        <ReactMarkdown>{source || "_Empty text cell — double-click to edit._"}</ReactMarkdown>
      </div>
      <button onClick={() => setEditing(true)} title="Edit text (or double-click)" className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-slate-400 opacity-60 transition hover:bg-slate-100 hover:text-brand-600 group-hover:opacity-100">
        <Pencil size={12} /> Edit
      </button>
    </div>
  );
}
