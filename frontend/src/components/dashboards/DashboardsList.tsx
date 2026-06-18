"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, LayoutDashboard, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Dashboards } from "@/lib/api";
import { useProject } from "@/lib/project";
import { useToast } from "@/lib/toast";
import { useConfirm } from "@/lib/confirm";
import { Badge, Card, cardVisual, CardGridSkeleton, EmptyState, ErrorState, GradientTile, PageHeader } from "@/components/ui";

export function DashboardsList() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { activeId: workspaceId } = useProject();
  const [title, setTitle] = useState("");

  const dashboards = useQuery({
    queryKey: ["dashboards", workspaceId],
    queryFn: () => Dashboards.list(workspaceId),
    enabled: !!workspaceId,
  });
  const create = useMutation({
    mutationFn: () => Dashboards.create(workspaceId!, title || "Untitled dashboard"),
    onSuccess: () => {
      setTitle("");
      qc.invalidateQueries({ queryKey: ["dashboards"] });
      toast("Dashboard created");
    },
    onError: () => toast("Couldn't create the dashboard", "error"),
  });
  const del = useMutation({
    mutationFn: (id: string) => Dashboards.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dashboards"] }); toast("Dashboard deleted"); },
    onError: () => toast("Couldn't delete the dashboard", "error"),
  });
  const duplicate = useMutation({
    mutationFn: async (id: string) => {
      const src = await Dashboards.get(id);
      const copy = await Dashboards.create(workspaceId!, `${src.title} (copy)`, src.description ?? undefined);
      const srcTiles = src.tiles.filter((t) => t.chart_id);
      for (const t of srcTiles) await Dashboards.addTile(copy.id, t.chart_id!);
      // Preserve the original tile layout (tiles were added in the same order).
      const fresh = await Dashboards.get(copy.id);
      const items = fresh.tiles.map((t, i) => ({ id: t.id, layout: srcTiles[i]?.layout ?? {} }));
      if (items.length) await Dashboards.saveLayout(copy.id, items);
      return copy;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dashboards"] }); toast("Dashboard duplicated"); },
    onError: () => toast("Couldn't duplicate the dashboard", "error"),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Dashboards"
        title="Dashboards"
        description="Assemble charts into interactive dashboards, then publish to the marketplace."
        actions={
          <div className="flex gap-2">
            <input
              className="w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm ring-focus"
              placeholder="New dashboard title…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && workspaceId && create.mutate()}
            />
            <button
              onClick={() => create.mutate()}
              disabled={!workspaceId || create.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              <Plus size={16} /> New
            </button>
          </div>
        }
      />

      {dashboards.isLoading ? (
        <CardGridSkeleton />
      ) : dashboards.isError ? (
        <div className="mt-6"><ErrorState onRetry={() => dashboards.refetch()} /></div>
      ) : (
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {dashboards.data?.map((d) => {
          const v = cardVisual(d.id, d.viz_types);
          return (
          <div key={d.id} className="group relative">
            <Link href={`/dashboards/${d.id}`}>
              <Card className="flex h-full flex-col p-5 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift">
                <GradientTile icon={v.icon} gradient={v.gradient} size={40} />
                <h3 className="mt-4 font-bold text-brand-950">{d.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                  {d.description || "No description yet."}
                </p>
                <div className="mt-auto flex items-center justify-between pt-3 text-xs text-slate-400">
                  <span>{d.tile_count} tile{d.tile_count === 1 ? "" : "s"}</span>
                  <Badge tone={d.status === "published" ? "success" : "muted"}>{d.status}</Badge>
                </div>
              </Card>
            </Link>
            <div className="absolute right-3 top-3 flex gap-0.5 rounded-lg bg-white/85 p-0.5 opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100 dark:bg-slate-800/85">
              <button
                onClick={(e) => { e.preventDefault(); duplicate.mutate(d.id); }}
                disabled={duplicate.isPending}
                title="Duplicate dashboard"
                className="rounded-lg p-1.5 text-slate-300 transition hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50"
              >
                <Copy size={15} />
              </button>
              <button
                onClick={async (e) => {
                  e.preventDefault();
                  if (await confirm({ title: `Delete dashboard "${d.title}"?`, message: "This permanently removes the dashboard and its tiles.", confirmLabel: "Delete", danger: true })) del.mutate(d.id);
                }}
                title="Delete dashboard"
                className="rounded-lg p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
          );
        })}
      </div>
      )}

      {dashboards.isSuccess && dashboards.data?.length === 0 && (
        <div className="mt-6">
          <EmptyState icon={LayoutDashboard} title="No dashboards yet" description="Create one above, then add charts saved from the SQL editor or a notebook." />
        </div>
      )}
    </div>
  );
}
