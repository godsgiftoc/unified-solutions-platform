import {
  ArrowRight,
  BarChart3,
  LayoutDashboard,
  LineChart,
  Map,
  NotebookPen,
  Plug,
  ScatterChart,
  Sparkles,
  Table2,
  Terminal,
} from "lucide-react";
import Link from "next/link";

import { ConnectorLogo } from "@/components/ConnectorLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { HeroChart } from "@/components/landing/HeroChart";

const CONNECTOR_TYPES = [
  "postgres", "dhis2", "commcare", "kobo", "odk",
  "surveycto", "gsheets", "gdrive", "databricks", "rest", "csv_upload",
];

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white">
      <TopNav />
      <Hero />
      <ConnectorsStrip />
      <Features />
      <ChartShowcase />
      <CtaBand />
      <Footer />
    </div>
  );
}

function TopNav() {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5 text-white">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-azure to-brand-500 font-black">
            U
          </span>
          <span className="font-bold">Unified Solutions Platform</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/marketplace"
            className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/20"
          >
            Launch platform
          </Link>
        </div>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-brand-950 text-white">
      <div className="orb -left-20 -top-24 h-96 w-96 bg-brand-600/40" />
      <div className="orb right-0 top-10 h-96 w-96 bg-azure/30" />
      <div className="absolute inset-0 bg-grid opacity-60" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 pb-24 pt-36 lg:grid-cols-2">
        <div className="animate-fade-up">
          <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Connect any data.
            <br />
            Build any <span className="text-gradient">dashboard.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-brand-100/80">
            Plug in CommCare, DHIS2, Postgres, Kobo, Sheets and more — shape it with SQL or Python,
            then build robust dashboards and share them with stakeholders. One platform, no hand-wiring.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-azure to-brand-500 px-6 py-3.5 font-semibold text-white shadow-glow transition hover:opacity-95"
            >
              Launch platform <ArrowRight size={18} />
            </Link>
            <a
              href="#features"
              className="rounded-xl px-5 py-3.5 font-semibold text-brand-100 ring-1 ring-white/20 transition hover:bg-white/10"
            >
              Explore capabilities
            </a>
          </div>
        </div>

        {/* Floating dashboard preview with a live chart */}
        <div className="animate-fade-up [animation-delay:120ms]">
          <div className="animate-float rounded-2xl bg-white p-5 shadow-lift ring-1 ring-white/40 dark:ring-white/10">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-bold text-brand-950">Antenatal Care — National</div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                LIVE
              </span>
            </div>
            <HeroChart />
            <div className="mt-3 grid grid-cols-3 gap-3">
              {[
                { k: "Visits (Aug)", v: "1,680" },
                { k: "Facilities", v: "720" },
                { k: "Coverage", v: "92%" },
              ].map((m) => (
                <div key={m.k} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                  <div className="text-[11px] text-slate-500">{m.k}</div>
                  <div className="text-lg font-bold text-brand-950">{m.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ConnectorsStrip() {
  return (
    <section className="border-b border-slate-100 bg-white py-10">
      <div className="mx-auto max-w-7xl px-6">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-400">
          Connects to the tools your programs already use
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-7">
          {CONNECTOR_TYPES.map((t) => (
            <div key={t} className="opacity-90 transition hover:opacity-100">
              <ConnectorLogo type={t} size={44} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: Plug,
    title: "Connect any source",
    body: "A gallery of connectors — CSV & file uploads, Postgres, DHIS2, CommCare, Kobo, ODK, SurveyCTO, Sheets, Databricks and REST. Secrets encrypted at rest.",
    href: "/data-services",
  },
  {
    icon: Table2,
    title: "Governed data catalog",
    body: "Browse your data the way a warehouse does — catalog ▸ schema ▸ table ▸ columns. Expand any table to inspect its schema; every table is queryable.",
    href: "/datasets",
  },
  {
    icon: Terminal,
    title: "SQL editor with IntelliSense",
    body: "A pgAdmin-style editor with ghost-text prediction for your tables, columns and keywords. Read-only and sandboxed, with save-as-chart.",
    href: "/sql",
  },
  {
    icon: NotebookPen,
    title: "Python notebooks",
    body: "Colab-style notebooks on a live kernel with pandas & matplotlib and inline prediction. Pull data with load_dataset() and save_chart() to a dashboard.",
    href: "/notebooks",
  },
  {
    icon: BarChart3,
    title: "Reusable charts",
    body: "Save a query as a chart, then edit its SQL, type and fields anytime in a live editor — changes flow to every dashboard that uses it.",
    href: "/charts",
  },
  {
    icon: LayoutDashboard,
    title: "Dashboards & maps",
    body: "A Looker-style drag-and-drop builder with cross-dashboard filters and OpenStreetMap geo maps — then publish to the marketplace.",
    href: "/dashboards",
  },
];

function Features() {
  return (
    <section id="features" className="bg-slate-50 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-5xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wider text-brand-600">
            ✦ One workflow
          </span>
          <h2 className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-2xl font-extrabold tracking-tight text-brand-950 sm:gap-x-2.5 sm:text-3xl lg:text-[2.6rem]">
            {["Connect", "Catalog", "Shape", "Visualize", "Share"].map((step, i) => (
              <span key={step} className="inline-flex items-center gap-1.5 sm:gap-2.5">
                {i > 0 && <span className="text-azure" aria-hidden>→</span>}
                {step}
              </span>
            ))}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-500">
            Everything you need to turn raw data into decisions — self-service, end to end.
            Click any capability to jump straight in.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Link
              key={f.title}
              href={f.href}
              className="group rounded-2xl border border-slate-200 bg-white p-7 shadow-card transition hover:-translate-y-1 hover:border-brand-300 hover:shadow-lift"
            >
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-azure to-brand-600 text-white">
                <f.icon size={22} />
              </div>
              <h3 className="mt-5 text-lg font-bold text-brand-950">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{f.body}</p>
              <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600">
                Open <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

const CHART_TYPES = [
  { icon: LineChart, label: "Time series" },
  { icon: BarChart3, label: "Bar & stacked" },
  { icon: ScatterChart, label: "Scatter plots" },
  { icon: Map, label: "Geo / choropleth" },
  { icon: Table2, label: "Tables & pivots" },
  { icon: Sparkles, label: "KPIs" },
];

function ChartShowcase() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <div>
            <span className="text-sm font-semibold uppercase tracking-wider text-brand-600">
              ✦ Built for heavy data
            </span>
            <h2 className="mt-3 text-4xl font-extrabold tracking-tight text-brand-950">
              Every chart your dashboards need
            </h2>
            <p className="mt-4 text-lg text-slate-500">
              Powered by a high-performance charting engine that handles large datasets — from national
              HMIS aggregates to row-level survey data and district-level maps.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {CHART_TYPES.map((c) => (
                <div
                  key={c.label}
                  className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-brand-900"
                >
                  <c.icon size={18} className="text-brand-500" /> {c.label}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lift">
            <div className="mb-3 text-sm font-bold text-brand-950">Program performance</div>
            <HeroChart />
          </div>
        </div>
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="relative overflow-hidden bg-brand-950 py-20 text-center text-white">
      <div className="orb left-1/2 top-0 h-72 w-72 -translate-x-1/2 bg-azure/30" />
      <div className="relative mx-auto max-w-2xl px-6">
        <h2 className="text-4xl font-extrabold tracking-tight">Ready to build your dashboard?</h2>
        <p className="mt-4 text-lg text-brand-100/80">
          Connect a data source and go from raw data to a shared dashboard in minutes.
        </p>
        <Link
          href="/marketplace"
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-azure to-brand-500 px-7 py-4 font-semibold shadow-glow transition hover:opacity-95"
        >
          Explore the Marketplace <ArrowRight size={18} />
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 text-sm text-slate-400 sm:flex-row">
        <span>Unified Solutions Platform · Open source (Apache-2.0)</span>
        <span>Connect · Shape · Build · Share</span>
      </div>
    </footer>
  );
}
