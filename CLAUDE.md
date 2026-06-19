# CLAUDE.md — project guide for AI sessions

This file orients a new Claude (or any contributor) fast. Read it before making changes.

## What this is

**Unified Solutions Platform (USP)** — a self-service data platform. A user creates a
**Project** (workspace), connects data from a **Data Services** gallery, the data lands
queryable, they shape it in a **SQL editor** or **Python notebook**, build **dashboards**
(Looker-style, incl. OpenStreetMap geo maps), and **share** them — including public
view-only links. Published dashboards appear in a cross-project **Marketplace**.

It is an **eHealth Africa** platform — **proprietary**, © eHealth Africa (see LICENSE),
for internal use within eHealth Africa and authorized partners. Use eHealth Africa
branding/copyright. (Note: this reverses the earlier personal/Apache-2.0 OSS direction —
the project was handed back to the organization.)

## Run it (dev)

Three pieces run together:

```bash
# infra (Postgres, Redis, MinIO)
make up

# backend  → http://localhost:8000  (docs at /docs)
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload

# frontend → http://localhost:5173
cd frontend && npm run dev
```

- **Env**: copy `.env.example` → `.env`; set `USP_MASTER_KEY` (a Fernet key). `.env` is
  gitignored and must never be committed. Env var prefix is `USP_` (internal codename;
  do not rename).
- **Auth**: in dev there's a fallback user `dev@local`; API calls work without a cookie.
- **Seed data**: `python -m app.scripts.seed` (and `seed_demo` / `seed_amr`).

## Verify after changes

```bash
cd frontend && npx tsc --noEmit          # must exit 0
# probe routes (dev server running):
for r in / /dashboards /charts /sql /notebooks /datasets /marketplace; do
  curl -s -o /dev/null -w "%{http_code} $r\n" "http://localhost:5173$r"; done
cd backend && ruff check . && python -m py_compile app/compute/_notebook_kernel.py
```

## Architecture

- **Backend** — FastAPI + SQLAlchemy 2.0 (`backend/app`). Postgres holds **metadata only**.
  **DuckDB** over Parquet is the analytical engine (`app/compute/engine.py`). MinIO/S3 for
  objects. Routers in `app/api/*` are explicitly registered in `app/main.py` (NOT auto-discovered).
- **Frontend** — **Next.js 14 App Router** + TypeScript + Tailwind (NOT Vite). Routes under
  `frontend/src/app/(platform)/*`; the public share page is `src/app/share/[token]`.
  TanStack Query for data, Apache ECharts for charts, Leaflet for OSM maps, Monaco for editors.
- **Namespace** — datasets are exposed as `main.<schema>.<table>` DuckDB views (Unity-Catalog style).
- **Notebook kernel** — one persistent subprocess per notebook (`app/compute/_notebook_kernel.py`,
  managed by `kernel_manager.py`). JSON-over-stdin/stdout. State persists across cells.
  Supports `!pip`/`!shell` and `%magic` lines (translated before `ast.parse`). It is a
  subprocess, **not** a hardened sandbox — see SECURITY.md.

## Frontend conventions (important)

- **Design system**: `src/components/ui.tsx` — `PageHeader`, `Card`, `Button`, `Badge`,
  `Modal`, `Field`, `inputClass`, `EmptyState`, `ErrorState`, `Skeleton`, `CardGridSkeleton`,
  `GradientTile`, `cardVisual()`. Reuse these; match their style.
- **Theme tokens**: `brand` = indigo scale, `azure` = teal accent (in `tailwind.config.ts`).
  Use `brand-*`/`azure` tokens, not raw hex. Brand was migrated from blue → indigo+teal.
- **Toasts**: `useToast()` from `src/lib/toast.tsx`. Failed React Query fetches auto-toast
  (wired in `providers.tsx`).
- **Dialogs**: NEVER use native `confirm()`/`prompt()`. Use `useConfirm()` / `usePrompt()`
  from `src/lib/confirm.tsx` (on-brand modals).
- **Dark mode**: `src/lib/theme.tsx` (`ThemeProvider`, `useTheme`, light/dark/system).
  Tailwind `darkMode: "class"`. Dark styling is mostly a **global override block at the
  bottom of `globals.css`** that remaps common utilities (`.dark .bg-white`, `.dark .text-brand-950`,
  etc.) so existing components adapt without per-file edits. For **arbitrary** colors
  (`bg-[#...]`) add explicit `dark:` variants.
- **Nav**: top bar `src/components/TopNav.tsx` (project switcher + links + theme toggle + Ask AI).
  There is NO sidebar (removed).
- **Relative time**: `timeAgo()` in `src/lib/format.ts`.
- **Dashboard filters**: `src/lib/dashboardFilters.ts` (State/LGA/date-range), shared by the
  builder and the public view.

## Gotchas

- **Changing `tailwind.config.ts` requires restarting `npm run dev`** — the JIT won't always
  hot-reload config (colors will look stale otherwise).
- The dashboard **properties panel** is a fixed slide-in drawer (`top-20`, below the nav). RGL
  width is measured with a **ResizeObserver** (`useContainerWidth`) — not WidthProvider — so
  tiles reflow when the drawer opens.
- Charts store `{sql, encoding}` in `spec`; editing a chart's query routes to `/sql?chart=<id>`.
- Run `cd frontend` before `npx tsc` (zsh doesn't word-split unquoted vars in scripts).

## State of the project

Done: full pipeline (connect→catalog→SQL/notebook→chart→dashboard→publish→marketplace),
public share links, global filters, robustness (loading/empty/error states + boundaries),
accessibility pass, custom dialogs, toasts, dark/system theme, top nav, indigo+teal theme.
**Auth**: username+password login + a superadmin admin page that provisions users (no public
sign-up); the whole platform is gated (dev auto-login is off by default). **Notebook**: live
streaming output, Stop (instant client-side + KeyboardInterrupt), clear output, build chart
from a table result. **Scaling**: kernel cap + idle reaper, DB pool tuning, login rate limit,
concurrent-run cap + wider request threadpool. Meta files (LICENSE, CONTRIBUTING, SECURITY,
CHANGELOG, .editorconfig, .github CI + templates) are now **proprietary © eHealth Africa**
(the Apache-2.0 LICENSE + NOTICE were removed in the org handover).

Known follow-ups / not done: SSO/OIDC (login is username+password only for now), Redis-backed
sessions + rate limiting for true multi-instance horizontal scale (current rate limit is
per-process), live extractors for the "config" connectors (DHIS2/Kobo/ODK/etc. are gallery
scaffolds), notebook gVisor sandbox, deeper test coverage. Set the real eHealth Africa team in
`.github/CODEOWNERS` (currently `@eHealthAfrica/usp-maintainers`) and the repo URL in `CHANGELOG.md`.
