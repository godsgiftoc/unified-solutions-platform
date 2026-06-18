"use client";

import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Connectors, type ConnectorCard } from "@/lib/api";
import { useProject } from "@/lib/project";
import { ConnectionWizard } from "./ConnectionWizard";
import { ConnectorLogo } from "./ConnectorLogo";
import { PageHeader } from "./ui";

export function DataServicesGallery() {
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<string | null>(null);

  const { activeId: workspaceId } = useProject();

  const connectors = useQuery({
    queryKey: ["connectors", workspaceId],
    queryFn: () => Connectors.list(workspaceId),
  });

  const filtered = useMemo(() => {
    const items = connectors.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.subtitle.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q),
    );
  }, [connectors.data, search]);

  return (
    <div>
      <PageHeader
        eyebrow="Data Services"
        title="Connect a data source"
        description="Browse available connectors and plug a new source into this workspace — every source is open for connection."
      />

      <div className="relative mt-6 max-w-2xl">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-[15px] shadow-card ring-focus"
          placeholder="Search for a connector…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {connectors.isLoading && <p className="mt-8 text-slate-400">Loading connectors…</p>}
      {connectors.isError && (
        <p className="mt-8 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load connectors. Is the API running and the dev user seeded?
        </p>
      )}

      <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {filtered.map((c) => (
          <Card key={c.type} card={c} onClick={() => setActive(c.type)} />
        ))}
      </div>

      {connectors.isSuccess && filtered.length === 0 && (
        <p className="mt-8 text-slate-400">No connectors match “{search}”.</p>
      )}

      {active && workspaceId && (
        <ConnectionWizard connectorType={active} workspaceId={workspaceId} onClose={() => setActive(null)} />
      )}
    </div>
  );
}

function Card({ card, onClick }: { card: ConnectorCard; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-card transition-all hover:-translate-y-1 hover:border-brand-300 hover:shadow-lift"
    >
      <ConnectorLogo type={card.type} size={56} />
      <div className="mt-1 font-bold text-brand-950">{card.name}</div>
      <div className="text-[13px] text-slate-500">{card.subtitle}</div>
      <span className="mt-1 text-[12px] font-semibold text-brand-600 opacity-0 transition group-hover:opacity-100">
        + Connect
      </span>
    </button>
  );
}
