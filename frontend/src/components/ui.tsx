"use client";

import {
  AreaChart,
  BarChart3,
  LayoutDashboard,
  LineChart,
  Loader2,
  type LucideIcon,
  Map,
  PieChart,
  RotateCcw,
  ScatterChart,
  Table2,
  TriangleAlert,
  X,
} from "lucide-react";
import Link from "next/link";

/** Tiny classnames joiner (avoids a clsx dependency). */
export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ----------------------------- Page header ----------------------------- */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200/70 pb-5">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-600">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-azure" /> {eyebrow}
          </div>
        )}
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-brand-950">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------- Buttons ------------------------------- */
type Variant = "primary" | "outline" | "ghost" | "danger";
const BTN: Record<Variant, string> = {
  primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800",
  outline: "border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "text-slate-400 hover:bg-red-50 hover:text-red-600",
};

export function buttonClass(variant: Variant = "primary", extra = "") {
  return cn(
    "inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:opacity-50",
    BTN[variant],
    extra,
  );
}

export function Button({
  variant = "primary",
  className,
  ...props
}: { variant?: Variant } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  className,
  ...props
}: { variant?: Variant } & React.ComponentProps<typeof Link>) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

/* -------------------------------- Card --------------------------------- */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-slate-200/80 bg-white shadow-card dark:border-white/10", className)} {...props} />;
}

/* ------------------------------- Badge --------------------------------- */
type BadgeTone = "brand" | "muted" | "success" | "warning";
const BADGE: Record<BadgeTone, string> = {
  brand: "bg-brand-50 text-brand-700",
  muted: "bg-slate-100 text-slate-500",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
};
export function Badge({ tone = "brand", className, children }: { tone?: BadgeTone; className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide", BADGE[tone], className)}>{children}</span>;
}

/* ------------------------------ Icon tiles ----------------------------- */
export function IconTile({ icon: Icon, size = 44 }: { icon: LucideIcon; size?: number }) {
  return (
    <div className="grid place-items-center rounded-xl bg-gradient-to-br from-azure to-brand-600 text-white" style={{ width: size, height: size }}>
      <Icon size={size * 0.45} />
    </div>
  );
}

/** A tile with a per-card gradient (so cards don't all look identical). */
export function GradientTile({ icon: Icon, gradient, size = 40 }: { icon: LucideIcon; gradient: string; size?: number }) {
  return (
    <div className={`grid place-items-center rounded-xl bg-gradient-to-br text-white ${gradient}`} style={{ width: size, height: size }}>
      <Icon size={size * 0.45} />
    </div>
  );
}

// Distinct accent gradients (kept on-brand: blues/cyans/indigos/teal/violet).
const GRADIENTS = [
  "from-sky-500 to-blue-600",
  "from-blue-500 to-indigo-600",
  "from-cyan-500 to-sky-600",
  "from-indigo-500 to-violet-600",
  "from-teal-500 to-cyan-600",
  "from-violet-500 to-blue-600",
  "from-blue-600 to-cyan-500",
  "from-sky-600 to-indigo-600",
];

const VIZ_ICON: Record<string, LucideIcon> = {
  map: Map, geomap: Map, pie: PieChart, line: LineChart, area: AreaChart,
  scatter: ScatterChart, bubble: ScatterChart, histogram: BarChart3,
  bar: BarChart3, column: BarChart3, table: Table2,
};

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministic, distinct {icon, gradient} per card — icon reflects content when known. */
export function cardVisual(seed: string, vizTypes?: string[]): { icon: LucideIcon; gradient: string } {
  const gradient = GRADIENTS[hashStr(seed) % GRADIENTS.length];
  let icon: LucideIcon = LayoutDashboard;
  if (vizTypes?.length) {
    const priority = ["map", "geomap", "pie", "line", "area", "scatter", "bubble", "histogram", "bar", "column", "table"];
    const found = priority.find((v) => vizTypes.includes(v));
    if (found) icon = VIZ_ICON[found] ?? LayoutDashboard;
  }
  return { icon, gradient };
}

/* -------------------------------- Modal -------------------------------- */
export function Modal({
  open,
  onClose,
  title,
  description,
  icon: Icon,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: LucideIcon;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md animate-fade-up rounded-2xl bg-white shadow-lift ring-1 ring-slate-200 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-slate-100 p-5">
          {Icon && (
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-azure to-brand-600 text-white">
              <Icon size={18} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-brand-950">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 rounded-b-2xl border-t border-slate-100 bg-slate-50 px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

export const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition ring-focus";

/* ----------------------------- Empty state ----------------------------- */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-500">
        <Icon size={22} />
      </div>
      <h3 className="mt-4 font-semibold text-brand-950">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ----------------------------- Loading / error ----------------------------- */
export function Spinner({ size = 18, className = "" }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} aria-hidden />;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} aria-hidden />;
}

/** A grid of card-shaped skeletons — matches the list pages while data loads. */
export function CardGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <Skeleton className="mt-4 h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-full" />
          <Skeleton className="mt-1.5 h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({
  title = "Couldn't load this",
  description = "Something went wrong fetching the data. Check your connection and try again.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center rounded-xl border border-dashed border-red-200 bg-red-50/40 px-6 py-14 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-red-100 text-red-600">
        <TriangleAlert size={22} />
      </div>
      <h3 className="mt-4 font-semibold text-brand-950">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
          <RotateCcw size={15} /> Try again
        </button>
      )}
    </div>
  );
}
