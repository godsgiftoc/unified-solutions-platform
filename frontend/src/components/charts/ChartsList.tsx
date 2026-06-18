"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";

import { Charts } from "@/lib/api";
import { useProject } from "@/lib/project";
import { useToast } from "@/lib/toast";
import { useConfirm } from "@/lib/confirm";
import { Badge, Card, cardVisual, CardGridSkeleton, EmptyState, ErrorState, GradientTile, PageHeader } from "@/components/ui";

export function ChartsList() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { activeId: workspaceId } = useProject();

  const charts = useQuery({
    queryKey: ["charts", workspaceId],
    queryFn: () => Charts.list(workspaceId),
    enabled: !!workspaceId,
  });
  const del = useMutation({
    mutationFn: (id: string) => Charts.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["charts"] }); toast("Chart deleted"); },
    onError: () => toast("Couldn't delete the chart", "error"),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Charts"
        title="Charts"
        description="Every chart you've saved from the SQL editor or a notebook. Open one to edit its query, type, and fields — changes flow to every dashboard using it."
        actions={
          <Link
            href="/sql"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <Plus size={16} /> New chart
          </Link>
        }
      />

      {charts.isLoading ? (
        <CardGridSkeleton />
      ) : charts.isError ? (
        <div className="mt-6"><ErrorState onRetry={() => charts.refetch()} /></div>
      ) : (
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {charts.data?.map((c) => {
          const v = cardVisual(c.id, [c.viz_type]);
          return (
            <div key={c.id} className="group relative">
              <Link href={`/sql?chart=${c.id}`}>
                <Card className="flex h-full flex-col p-5 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift">
                  <div className="flex items-center justify-between">
                    <GradientTile icon={v.icon} gradient={v.gradient} size={40} />
                    <Badge tone="muted">{c.viz_type}</Badge>
                  </div>
                  <h3 className="mt-4 font-bold text-brand-950">{c.name}</h3>
                  <code className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-400">{c.sql}</code>
                  <div className="mt-auto flex items-center gap-1.5 pt-3 text-xs font-semibold text-brand-600">
                    <Pencil size={12} /> Edit query in SQL editor
                  </div>
                </Card>
              </Link>
              <button
                onClick={async (e) => {
                  e.preventDefault();
                  if (await confirm({ title: `Delete chart "${c.name}"?`, message: "Dashboards using this chart will lose the tile.", confirmLabel: "Delete", danger: true })) del.mutate(c.id);
                }}
                title="Delete chart"
                className="absolute bottom-3 right-3 rounded-lg bg-white/85 p-1.5 text-slate-300 opacity-0 shadow-sm backdrop-blur transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:bg-slate-800/85"
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>
      )}

      {charts.isSuccess && charts.data?.length === 0 && (
        <div className="mt-6">
          <EmptyState
            icon={BarChart3}
            title="No charts yet"
            description="Run a query in the SQL editor and click “Save as chart”, or use save_chart() in a notebook."
          />
        </div>
      )}
    </div>
  );
}
