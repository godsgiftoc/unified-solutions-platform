import type { LucideIcon } from "lucide-react";

export function Placeholder({
  eyebrow,
  title,
  description,
  bullets,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  icon: LucideIcon;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-600">
        <span className="text-azure">✦</span> {eyebrow}
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight text-brand-950">{title}</h1>
      <p className="mt-1.5 max-w-2xl text-slate-500">{description}</p>

      <div className="mt-8 flex max-w-2xl flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-card">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-azure to-brand-600 text-white">
          <Icon size={28} />
        </div>
        <h2 className="mt-5 text-lg font-bold text-brand-950">On the roadmap</h2>
        <p className="mt-1 text-sm text-slate-500">This surface is part of the next build phase.</p>
        <ul className="mt-5 grid gap-2 text-left text-sm text-slate-600">
          {bullets.map((b) => (
            <li key={b} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> {b}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
