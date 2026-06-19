"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";

import { useTheme, type Theme } from "@/lib/theme";

/** Light / System / Dark switcher — a single button that opens a small menu. */
export function ThemeToggle() {
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
