# Unified Solutions Platform (USP)

A self-service data platform: **connect** any data source from a gallery,
**shape** it with SQL or a Python notebook, **build** dashboards, and **share**
them — without hand-wiring each one.

> Connect → Catalog → Shape (SQL/Python) → Visualize → Share

An **eHealth Africa** platform. Proprietary — internal use within eHealth Africa
and authorized partners.

## Features

- **Data Services gallery** — one-file-per-connector registry. Native CSV upload
  and Postgres today; config scaffolds for DHIS2, CommCare, Kobo, ODK, SurveyCTO,
  Google Sheets/Drive, Databricks, and generic REST. Secrets are envelope-encrypted.
- **Governed data catalog** — browse `catalog ▸ schema ▸ table ▸ columns` like a
  warehouse; expand any table for its schema and a live sample.
- **SQL editor** — read-only DuckDB execution (sqlglot-guarded), inline ghost-text
  autocomplete for your tables/columns/keywords, and save-as-chart.
- **Python notebooks** — Colab-style cells on a persistent kernel with pandas &
  matplotlib, inline autocomplete, and `load_dataset()` / `save_dataset()` /
  `save_chart()` helpers.
- **Charts** — reusable; editing a chart's query reopens it in the SQL editor and
  updates every dashboard that uses it.
- **Dashboards** — drag-and-drop builder with a slide-in properties panel, global
  filters (date range + State/LGA), and OpenStreetMap geo maps.
- **Sharing** — view-only public links (no login), plus rename and duplicate.
- **Marketplace** — browse published dashboards across projects.

## Stack

| Layer | Tech |
|---|---|
| API | Python 3.12 · FastAPI · SQLAlchemy 2.0 · Alembic |
| Workers | Arq (Redis) + scheduler |
| Metadata DB | PostgreSQL |
| Analytical engine | DuckDB over Parquet (object storage) |
| Object storage | MinIO (dev) / S3 (prod) |
| Frontend | Next.js 14 (App Router) · TypeScript · Tailwind CSS · TanStack Query |
| Charts & maps | Apache ECharts · Leaflet / OpenStreetMap |
| Editors | Monaco (SQL + Python) |

## Quick start (dev)

Requirements: Python 3.12+, Node 20+, Docker.

```bash
# 1. Environment
cp .env.example .env
# generate a master key and paste it into .env (USP_MASTER_KEY):
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# 2. Infra (Postgres, Redis, MinIO)
make up

# 3. Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
python -m app.scripts.init_db      # create tables
python -m app.scripts.seed         # seed a dev user + workspace
uvicorn app.main:app --reload      # http://localhost:8000/docs

# 4. Frontend (new terminal)
cd frontend
npm install
npm run dev                        # http://localhost:5173
```

In development, authentication falls back to a seeded local user, so you can use
the app before wiring real OIDC.

## Repository layout

```
backend/    FastAPI app (app/), models, connectors, compute engine, Alembic
frontend/   Next.js 14 App Router UI (src/app, src/components, src/lib)
docs/       Architecture notes (docs/ARCHITECTURE.md)
infra/      docker-compose for Postgres / Redis / MinIO
```

## Development checks

```bash
# backend
cd backend && ruff check . && pytest
# frontend
cd frontend && npm run lint && npm run typecheck && npm run build
```

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Security
reports: see [SECURITY.md](SECURITY.md).

## License

Proprietary — © 2026 eHealth Africa. All rights reserved. See [LICENSE](LICENSE).
