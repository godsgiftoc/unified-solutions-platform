# Unified Solutions Platform — Architecture

> Connect any data source → ingest it → shape it with **SQL or Python** → build a **dashboard** → **share it to stakeholders**.

A presentation-ready, browser version of these diagrams is at
[`docs/architecture.html`](architecture.html) — open it in a browser and use
**Save as PDF** for slides.

---

## 1. The analyst journey

```mermaid
flowchart LR
  A["① Connect<br/><b>Pick a Data Service</b>"] --> B["② Ingest<br/><b>Sync to warehouse</b>"]
  B --> C["③ Shape<br/><b>SQL / Python</b>"]
  C --> D["④ Build<br/><b>Dashboard</b>"]
  D --> E["⑤ Share<br/><b>Stakeholders</b>"]
```

One self-service loop replaces hand-wiring every dashboard. An analyst never
waits on an engineer to onboard a source.

---

## 2. System architecture

```mermaid
flowchart TB
  %% Connect at the layer level so each band lays out as a clean row.
  UI   -->|REST / WebSocket| API
  API  -->|orchestrate syncs| WRK
  API  -->|query · read / write| STORE
  WRK  -->|land Parquet| STORE
  SRC  -->|extract| WRK

  subgraph UI["PRESENTATION — React + TypeScript SPA"]
    direction LR
    u1["Data Services<br/>Gallery"] ~~~ u2["SQL<br/>Editor"] ~~~ u3["Python<br/>Notebook"] ~~~ u4["Dashboard<br/>Builder"] ~~~ u5["Viewer +<br/>Share"]
  end

  subgraph API["APPLICATION — FastAPI · Auth / RBAC / Workspaces / Audit"]
    direction LR
    a1["Connector<br/>Registry"] ~~~ a2["Sync<br/>Orchestrator"] ~~~ a3["Query<br/>Service"] ~~~ a4["Dashboard<br/>Service"]
  end

  subgraph WRK["WORKERS — Redis-backed"]
    direction LR
    w1["Sync<br/>Worker"] ~~~ w2["Scheduler"] ~~~ w3["Notebook Kernel<br/>(gVisor sandbox)"]
  end

  subgraph STORE["STORAGE"]
    direction LR
    d1[("Postgres<br/>metadata")] ~~~ d2[("Object store<br/>Parquet")] ~~~ d3["DuckDB<br/>engine"] ~~~ d4[("Redis<br/>cache · sessions")]
  end

  subgraph SRC["EXTERNAL DATA SOURCES"]
    direction LR
    s1["CommCare"] ~~~ s2["Kobo · ODK<br/>SurveyCTO"] ~~~ s3["DHIS2"] ~~~ s4["Sheets · Drive"] ~~~ s5["Databricks"] ~~~ s6["REST /<br/>Webhook"] ~~~ s7["CSV / Excel"]
  end

  classDef layer fill:#e3f0fb,stroke:#1573c0,color:#082a4d;
  class u1,u2,u3,u4,u5,a1,a2,a3,a4,w1,w2,w3,d1,d2,d3,d4,s1,s2,s3,s4,s5,s6,s7 layer;
```

**Why these choices** (full rationale in the build plan):
- **FastAPI + Postgres** — async API; Postgres holds *metadata only* (no analytical scans).
- **DuckDB over Parquet** — fast columnar analytics, embeds in the notebook for zero-copy data access; ClickHouse swap-in at scale.
- **Arq workers + scheduler** — manual "Sync now" and cron syncs share one path.
- **gVisor-sandboxed kernels** — run untrusted analyst Python safely (no egress, resource-capped).

---

## 3. Data flow — source to stakeholder

```mermaid
flowchart LR
  SRC["Data source<br/>(DHIS2, CSV, …)"] --> EX["Connector extractor"]
  EX --> RAW[("Raw Parquet landing")]
  RAW --> DS["Dataset<br/>(governed, versioned)"]
  DS --> SQL["SQL editor"]
  DS --> PY["Python notebook"]
  SQL --> CH["Saved chart / table"]
  PY --> CH
  CH --> TILE["Dashboard tile"]
  TILE --> DASH["Dashboard<br/>(date · org-unit · map filters)"]
  DASH --> SHARE["Share to stakeholders"]
```

Dashboards bind to **datasets**, never to raw source schemas — so evolving
survey forms never break a dashboard.

---

## 4. Security & governance (cross-cutting)

```mermaid
flowchart LR
  L1["SSO login<br/>(Google Workspace)"] --> L2["Workspaces + RBAC"]
  L2 --> L3["authorize() on<br/>every request"]
  L3 --> L4["Encrypted secrets<br/>(envelope / KMS)"]
  L4 --> L5["Read-only SQL +<br/>sandboxed Python"]
  L5 --> L6["Audit log +<br/>data freshness"]
```

Every resource is **workspace-scoped**; secrets are envelope-encrypted and never
returned by the API; analyst SQL is read-only and Python runs sandboxed.
