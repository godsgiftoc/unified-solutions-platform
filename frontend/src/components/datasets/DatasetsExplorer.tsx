"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Columns3,
  Database,
  Folder,
  FolderOpen,
  Plug,
  Search,
  Table2,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Datasets, type Dataset } from "@/lib/api";
import { useProject } from "@/lib/project";
import { useToast } from "@/lib/toast";
import { useConfirm } from "@/lib/confirm";
import { DataTable } from "@/components/charts/DataTable";
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui";

export function DatasetsExplorer() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { activeId: workspaceId } = useProject();
  const datasets = useQuery({
    queryKey: ["datasets", workspaceId],
    queryFn: () => Datasets.list(workspaceId),
    enabled: !!workspaceId,
  });
  const detail = useQuery({
    queryKey: ["dataset", selectedId],
    queryFn: () => Datasets.get(selectedId!),
    enabled: !!selectedId,
  });
  const preview = useQuery({
    queryKey: ["dataset-preview", selectedId],
    queryFn: () => Datasets.preview(selectedId!, 100),
    enabled: !!selectedId,
  });
  const del = useMutation({
    mutationFn: (id: string) => Datasets.remove(id),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["datasets"] });
      if (selectedId === id) setSelectedId(null);
      toast("Table deleted");
    },
    onError: () => toast("Couldn't delete the table", "error"),
  });

  // Build the catalog → schema → tables tree.
  const tree = useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = (datasets.data ?? []).filter(
      (d) => !q || d.name.toLowerCase().includes(q) || d.slug.toLowerCase().includes(q) || d.schema_name.includes(q),
    );
    const out: Record<string, Record<string, Dataset[]>> = {};
    for (const d of items) {
      (out[d.catalog] ??= {});
      (out[d.catalog][d.schema_name] ??= []).push(d);
    }
    return out;
  }, [datasets.data, search]);

  const toggle = (key: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  return (
    <div>
      <PageHeader
        eyebrow="Catalog"
        title="Data catalog"
        description="Browse your governed data the way a warehouse does — catalog ▸ schema ▸ table. Every table is queryable in SQL and notebooks."
        actions={
          <Link href="/data-services" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            <Plug size={16} /> Add a data source
          </Link>
        }
      />

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Catalog tree */}
        <div className="flex max-h-[78vh] flex-col rounded-xl border border-slate-200 bg-white shadow-card">
          <div className="relative border-b border-slate-100 p-2.5">
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm ring-focus"
              placeholder="Search tables…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2 text-sm">
            {datasets.isLoading && (
              <div className="space-y-2 p-2" aria-busy="true">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
              </div>
            )}
            {datasets.isError && (
              <div className="p-3"><ErrorState title="Couldn't load the catalog" description="The data catalog failed to load." onRetry={() => datasets.refetch()} /></div>
            )}
            {Object.entries(tree).map(([catalog, schemas]) => (
              <div key={catalog}>
                <div className="flex items-center gap-1.5 px-2 py-1.5 font-semibold text-brand-950">
                  <Database size={15} className="text-brand-600" /> {catalog}
                </div>
                {Object.entries(schemas).map(([schema, tables]) => {
                  const key = `${catalog}.${schema}`;
                  const isCollapsed = collapsed.has(key);
                  return (
                    <div key={key} className="ml-1.5">
                      <button onClick={() => toggle(key)} className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-slate-600 hover:bg-slate-50">
                        {isCollapsed ? <ChevronRight size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                        {isCollapsed ? <Folder size={15} className="text-azure" /> : <FolderOpen size={15} className="text-azure" />}
                        <span className="font-medium">{schema}</span>
                        <span className="ml-auto rounded bg-slate-100 px-1.5 text-[11px] text-slate-500">{tables.length}</span>
                      </button>
                      {!isCollapsed &&
                        tables.map((d) => (
                          <TableNode
                            key={d.id}
                            dataset={d}
                            selected={selectedId === d.id}
                            onSelect={() => setSelectedId(d.id)}
                            onDelete={async () => { if (await confirm({ title: `Delete table "${d.name}"?`, message: "This removes the table from the catalog.", confirmLabel: "Delete", danger: true })) del.mutate(d.id); }}
                          />
                        ))}
                    </div>
                  );
                })}
              </div>
            ))}
            {datasets.isSuccess && Object.keys(tree).length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-slate-400">{search ? "No matches." : "No tables yet."}</p>
            )}
          </div>
        </div>

        {/* Detail pane */}
        <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
          {!detail.data ? (
            <div className="flex h-72 flex-col items-center justify-center text-slate-400">
              <Table2 size={32} />
              <p className="mt-2 text-sm">Select a table to inspect its schema and sample.</p>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-lg font-bold text-brand-950">{detail.data.name}</h2>
                    <Badge tone="brand">{detail.data.kind}</Badge>
                  </div>
                  <code className="mt-1 block truncate text-xs text-slate-500">{detail.data.full_name}</code>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span><b className="text-brand-950">{detail.data.row_count ?? "?"}</b> rows</span>
                  <span><b className="text-brand-950">{detail.data.columns.length}</b> cols</span>
                  <span className="rounded-md bg-slate-100 px-2 py-1">
                    query as <code className="font-semibold text-brand-700">{detail.data.schema_name}.{detail.data.slug}</code>
                  </span>
                </div>
              </div>

              <div className="border-t border-slate-100 px-5 pb-2 pt-3 text-xs font-semibold text-slate-500">Sample data</div>
              <div className="px-5 pb-5">
                {preview.isLoading ? (
                  <p className="text-sm text-slate-400">Loading…</p>
                ) : preview.data ? (
                  <DataTable result={preview.data} maxHeight="max-h-[62vh]" />
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      {datasets.isSuccess && datasets.data?.length === 0 && (
        <div className="mt-6">
          <EmptyState icon={Database} title="No tables in the catalog yet" description="Connect a source or upload a file in Data Services to populate your catalog." />
        </div>
      )}
    </div>
  );
}

/** A table row in the catalog tree: click the name to inspect (sample shows on the
 *  right), click the chevron to expand its columns inline — like a warehouse browser. */
function TableNode({
  dataset,
  selected,
  onSelect,
  onDelete,
}: {
  dataset: Dataset;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const detail = useQuery({
    queryKey: ["dataset", dataset.id],
    queryFn: () => Datasets.get(dataset.id),
    enabled: open,
  });

  return (
    <div className="ml-5">
      <div className={`group flex items-center gap-1 rounded-md pr-1 ${selected ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-50"}`}>
        <button
          onClick={() => setOpen((o) => !o)}
          title={open ? "Hide columns" : "Show columns"}
          className="shrink-0 rounded p-1 text-slate-400 hover:text-brand-600"
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <button onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left">
          <Table2 size={13} className="shrink-0 text-slate-400" />
          <span className="truncate">{dataset.name}</span>
        </button>
        <button
          onClick={onDelete}
          className="shrink-0 rounded p-0.5 text-slate-300 opacity-0 transition hover:text-red-600 group-hover:opacity-100"
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {open && (
        <div className="ml-[18px] mt-0.5 space-y-px border-l border-slate-100 pl-2">
          {detail.isLoading && <p className="px-1.5 py-1 text-[11px] text-slate-400">Loading columns…</p>}
          {detail.data?.columns.map((c) => (
            <div key={c.name} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-50">
              <Columns3 size={11} className="shrink-0 text-slate-300" />
              <span className="min-w-0 flex-1 truncate text-[12px] text-slate-600">{c.name}</span>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-azure">{c.type}</span>
            </div>
          ))}
          {detail.isSuccess && detail.data.columns.length === 0 && (
            <p className="px-1.5 py-1 text-[11px] text-slate-400">No columns.</p>
          )}
        </div>
      )}
    </div>
  );
}
