"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Check,
  ChevronsUpDown,
  FolderKanban,
  LayoutDashboard,
  Monitor,
  Moon,
  NotebookPen,
  Plug,
  Plus,
  Sparkles,
  Store,
  Sun,
  Table2,
  Terminal,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Notebooks, Workspaces } from "@/lib/api";
import { useProject } from "@/lib/project";
import { useTheme, type Theme } from "@/lib/theme";
import { useToast } from "@/lib/toast";
import { Button, Field, inputClass, Modal } from "@/components/ui";

const NAV = [
  { href: "/marketplace", label: "Marketplace", icon: Store },
  { href: "/dashboards", label: "Dashboards", icon: LayoutDashboard },
  { href: "/charts", label: "Charts", icon: BarChart3 },
  { href: "/datasets", label: "Catalog", icon: Table2 },
  { href: "/sql", label: "SQL", icon: Terminal },
  { href: "/notebooks", label: "Notebooks", icon: NotebookPen },
  { href: "/data-services", label: "Data Services", icon: Plug },
];

export function TopNav() {
  const pathname = usePathname();
  const { activeId } = useProject();

  // "Notebooks" jumps straight into the most recently edited notebook (the list
  // returns newest-first); if there are none, it falls back to the list page.
  const notebooks = useQuery({
    queryKey: ["notebooks", activeId],
    queryFn: () => Notebooks.list(activeId),
    enabled: !!activeId,
  });
  const notebooksHref = notebooks.data && notebooks.data.length > 0 ? `/notebooks/${notebooks.data[0].id}` : "/notebooks";

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-brand-950 text-white">
      <div className="flex h-20 items-center gap-3 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link href="/" className="flex shrink-0 items-center gap-2.5" title="Home">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-azure to-brand-500 text-sm font-black">U</span>
          <span className="hidden text-sm font-bold xl:block">Unified Solutions Platform</span>
        </Link>

        <span className="mx-3 hidden h-7 w-px bg-white/12 sm:block" />

        <ProjectSwitcher />

        <span className="hidden h-7 w-px bg-white/15 md:block" />

        {/* Nav — sits next to the project switcher; scrolls only if too narrow */}
        <nav aria-label="Primary" className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname?.startsWith(href + "/");
            const to = href === "/notebooks" ? notebooksHref : href;
            return (
              <Link
                key={href}
                href={to}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm transition ${
                  active ? "bg-white/15 font-semibold text-white" : "text-brand-100/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon size={16} className="shrink-0" /> {label}
              </Link>
            );
          })}
        </nav>

        <ThemeToggle />

        <button
          title="Ask AI"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
        >
          <Sparkles size={16} className="text-azure" /> <span className="hidden sm:inline">Ask AI</span>
        </button>
      </div>
    </header>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const opts: { v: Theme; icon: typeof Sun; label: string }[] = [
    { v: "light", icon: Sun, label: "Light" },
    { v: "system", icon: Monitor, label: "System" },
    { v: "dark", icon: Moon, label: "Dark" },
  ];
  const Current = (opts.find((o) => o.v === theme) ?? opts[1]).icon;

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Theme"
        aria-label="Theme"
        aria-haspopup="menu"
        className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-brand-100/80 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white"
      >
        <Current size={17} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 top-full z-20 mt-1.5 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-slate-700 shadow-lift">
            {opts.map(({ v, icon: Icon, label }) => (
              <button
                key={v}
                role="menuitemradio"
                aria-checked={theme === v}
                onClick={() => { setTheme(v); setOpen(false); }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-slate-50 ${theme === v ? "font-semibold text-brand-700" : ""}`}
              >
                <Icon size={15} className={theme === v ? "text-brand-600" : "text-slate-400"} /> {label}
                {theme === v && <Check size={14} className="ml-auto text-brand-600" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ProjectSwitcher() {
  const { projects, active, setActiveId } = useProject();
  const qc = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const create = useMutation({
    mutationFn: () => Workspaces.create(name.trim(), description.trim() || undefined),
    onSuccess: (ws) => {
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      setActiveId(ws.id);
      setShowCreate(false);
      setName("");
      setDescription("");
      toast(`Project “${ws.name}” created`);
      router.push("/data-services");
    },
    onError: () => toast("Couldn't create the project", "error"),
  });

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-left ring-1 ring-white/10 transition hover:bg-white/10"
      >
        <FolderKanban size={15} className="shrink-0 text-azure" />
        <div className="min-w-0 max-w-[9rem]">
          <div className="text-[9px] uppercase tracking-wide text-brand-200/60">Project</div>
          <div className="truncate text-sm font-semibold leading-tight">{active?.name ?? "Select…"}</div>
        </div>
        <ChevronsUpDown size={14} className="shrink-0 text-brand-200/60" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1.5 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-slate-700 shadow-lift">
            <div className="max-h-64 overflow-auto">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setActiveId(p.id); setOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <Check size={14} className={p.id === active?.id ? "text-brand-600" : "text-transparent"} />
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
            <div className="border-t border-slate-100">
              <button
                onClick={() => { setOpen(false); setShowCreate(true); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-brand-700 hover:bg-brand-50"
              >
                <Plus size={14} /> New project
              </button>
            </div>
          </div>
        </>
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        icon={FolderKanban}
        title="Create a project"
        description="A project holds its own data sources, datasets, notebooks, and dashboards."
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
              {create.isPending ? "Creating…" : "Create project"}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-slate-900">
          <Field label="Project name">
            <input
              autoFocus
              className={inputClass}
              placeholder="e.g. AMR Surveillance"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && create.mutate()}
            />
          </Field>
          <Field label="Description (optional)">
            <input
              className={inputClass}
              placeholder="What is this project for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
