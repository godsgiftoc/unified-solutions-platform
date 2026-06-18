"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, FolderKanban, LayoutDashboard, Search, User } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Marketplace, type MarketplaceItem } from "@/lib/api";
import { Badge, Card, cardVisual, CardGridSkeleton, EmptyState, ErrorState, GradientTile, IconTile, PageHeader } from "@/components/ui";

interface Project {
  id: string;
  name: string;
  description: string | null;
  dashboards: MarketplaceItem[];
}

export function MarketplaceView() {
  const [search, setSearch] = useState("");
  const [openProject, setOpenProject] = useState<string | null>(null);
  const items = useQuery({ queryKey: ["marketplace"], queryFn: () => Marketplace.list() });

  // Group published dashboards into projects.
  const projects = useMemo<Project[]>(() => {
    const byId: Record<string, Project> = {};
    for (const m of items.data ?? []) {
      byId[m.workspace_id] ??= {
        id: m.workspace_id,
        name: m.workspace_name ?? "Untitled project",
        description: m.workspace_description ?? null,
        dashboards: [],
      };
      byId[m.workspace_id].dashboards.push(m);
    }
    return Object.values(byId);
  }, [items.data]);

  const active = projects.find((p) => p.id === openProject) ?? null;

  // ---- Project detail (dashboards within a project) ----
  if (active) {
    const q = search.trim().toLowerCase();
    const dashboards = q ? active.dashboards.filter((d) => d.title.toLowerCase().includes(q)) : active.dashboards;
    return (
      <div>
        <button onClick={() => { setOpenProject(null); setSearch(""); }} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-700">
          <ArrowLeft size={15} /> All projects
        </button>
        <PageHeader
          eyebrow="Marketplace · project"
          title={active.name}
          description={active.description || `${active.dashboards.length} published dashboard${active.dashboards.length === 1 ? "" : "s"} in this project.`}
        />
        <SearchBar value={search} onChange={setSearch} placeholder="Search dashboards…" />
        <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {dashboards.map((m) => {
            const v = cardVisual(m.id, m.viz_types);
            return (
              <Link key={m.id} href={`/marketplace/${m.id}`} className="group">
                <Card className="flex h-full flex-col p-5 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift">
                  <div className="flex items-center justify-between">
                    <GradientTile icon={v.icon} gradient={v.gradient} size={40} />
                    <ArrowRight size={16} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
                  </div>
                  <h3 className="mt-4 font-bold text-brand-950">{m.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">{m.description || "No description provided."}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {m.viz_types.slice(0, 5).map((vt) => <Badge key={vt} tone="brand">{vt}</Badge>)}
                  </div>
                  <div className="mt-auto flex items-center gap-1.5 border-t border-slate-100 pt-3.5 text-xs text-slate-500">
                    <User size={12} /> {m.owner_name ?? "Unknown"}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  // ---- Projects grid ----
  const q = search.trim().toLowerCase();
  const shown = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;
  return (
    <div>
      <PageHeader
        eyebrow="Marketplace · all projects"
        title="Dashboard marketplace"
        description="Browse projects across the platform — open one to explore its published dashboards."
      />
      <SearchBar value={search} onChange={setSearch} placeholder="Search projects…" />

      {items.isLoading ? (
        <CardGridSkeleton />
      ) : items.isError ? (
        <div className="mt-7"><ErrorState onRetry={() => items.refetch()} /></div>
      ) : (
      <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((p) => {
          const vizes = [...new Set(p.dashboards.flatMap((d) => d.viz_types))].slice(0, 5);
          return (
            <button key={p.id} onClick={() => { setOpenProject(p.id); setSearch(""); }} className="group text-left">
              <Card className="flex h-full flex-col p-5 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift">
                <div className="flex items-center justify-between">
                  <IconTile icon={FolderKanban} size={40} />
                  <Badge tone="brand">{p.dashboards.length} dashboard{p.dashboards.length === 1 ? "" : "s"}</Badge>
                </div>
                <h3 className="mt-4 font-bold text-brand-950">{p.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-slate-500">{p.description || "Published dashboards from this project."}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {vizes.map((vt) => <Badge key={vt} tone="muted">{vt}</Badge>)}
                </div>
                <div className="mt-auto flex items-center gap-1.5 pt-4 text-xs font-semibold text-brand-600">
                  Open project <ArrowRight size={13} className="transition group-hover:translate-x-0.5" />
                </div>
              </Card>
            </button>
          );
        })}
      </div>
      )}

      {items.isSuccess && projects.length === 0 && (
        <div className="mt-7">
          <EmptyState icon={LayoutDashboard} title="No published dashboards yet" description="Publish a dashboard in any project and its project will appear here." />
        </div>
      )}
    </div>
  );
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative mt-6 max-w-xl">
      <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-[15px] shadow-card ring-focus"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
