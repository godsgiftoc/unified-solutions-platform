"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, NotebookPen, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

import { Notebooks } from "@/lib/api";
import { useProject } from "@/lib/project";
import { useToast } from "@/lib/toast";
import { useConfirm } from "@/lib/confirm";
import { timeAgo } from "@/lib/format";
import { Card, cardVisual, CardGridSkeleton, EmptyState, ErrorState, GradientTile, PageHeader } from "@/components/ui";

export function NotebooksList() {
  const qc = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { activeId: workspaceId } = useProject();
  const [name, setName] = useState("");

  const notebooks = useQuery({
    queryKey: ["notebooks", workspaceId],
    queryFn: () => Notebooks.list(workspaceId),
    enabled: !!workspaceId,
  });

  const create = useMutation({
    mutationFn: () => Notebooks.create(workspaceId!, name.trim() || `Untitled ${(notebooks.data?.length ?? 0) + 1}`),
    onSuccess: (nb) => {
      qc.invalidateQueries({ queryKey: ["notebooks"] });
      toast("Notebook created");
      router.push(`/notebooks/${nb.id}`);
    },
    onError: () => toast("Couldn't create the notebook", "error"),
  });

  const del = useMutation({
    mutationFn: (id: string) => Notebooks.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notebooks"] }); toast("Notebook deleted"); },
    onError: () => toast("Couldn't delete the notebook", "error"),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Notebooks"
        title="Python notebooks"
        description="Explore data with pandas & matplotlib — use load_dataset('slug') to pull any dataset."
        actions={
          <div className="flex gap-2">
            <input
              className="w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm ring-focus"
              placeholder="New notebook name…"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
      <div className="mt-6" />

      {notebooks.isLoading ? (
        <CardGridSkeleton />
      ) : notebooks.isError ? (
        <div className="mt-8"><ErrorState onRetry={() => notebooks.refetch()} /></div>
      ) : (
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {notebooks.data?.map((n) => (
          <div key={n.id} className="group relative">
            <Link href={`/notebooks/${n.id}`}>
              <Card className="flex h-full flex-col p-5 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift">
                <GradientTile icon={NotebookPen} gradient={cardVisual(n.id).gradient} size={40} />
                <h3 className="mt-4 font-bold text-brand-950">{n.name}</h3>
                <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                  <span>{n.cell_count} cell{n.cell_count === 1 ? "" : "s"}</span>
                  <span className="inline-flex items-center gap-1 text-slate-400" title={new Date(n.updated_at).toLocaleString()}>
                    <Clock size={12} /> {timeAgo(n.updated_at)}
                  </span>
                </div>
              </Card>
            </Link>
            <button
              onClick={async (e) => {
                e.preventDefault();
                if (await confirm({ title: `Delete notebook "${n.name}"?`, message: "This permanently removes the notebook and all its cells.", confirmLabel: "Delete", danger: true })) del.mutate(n.id);
              }}
              title="Delete notebook"
              className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      )}

      {notebooks.isSuccess && notebooks.data?.length === 0 && (
        <div className="mt-8">
          <EmptyState icon={NotebookPen} title="No notebooks yet" description="Create one to start exploring your data in Python." />
        </div>
      )}
    </div>
  );
}
