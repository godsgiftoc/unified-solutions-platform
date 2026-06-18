# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project aims
to follow [Semantic Versioning](https://semver.org/) once it reaches 1.0.

## [Unreleased]

### Added
- Data Services gallery with one-file-per-connector registry (CSV upload,
  Postgres, and config scaffolds for DHIS2, CommCare, Kobo, ODK, SurveyCTO,
  Sheets, Drive, Databricks, REST).
- Warehouse-style data catalog (catalog ▸ schema ▸ table ▸ columns) with
  inline column inspection and sample data.
- SQL editor with read-only DuckDB execution, inline ghost-text autocomplete for
  tables/columns/keywords, and save-as-chart.
- Colab-style Python notebooks on a persistent kernel with inline autocomplete
  and `load_dataset()` / `save_dataset()` / `save_chart()` helpers.
- Reusable charts with a dedicated section; editing a chart's query opens the
  SQL editor and updates every dashboard that uses it.
- Looker-style dashboard builder: drag-and-drop tiles, a slide-in properties
  panel, global filters (date range + State/LGA), and OpenStreetMap geo maps.
- View-only public share links for dashboards, plus rename and duplicate.
- Cross-project marketplace of published dashboards.
- Platform-wide toast notifications and on-brand confirm/prompt dialogs.
- Robust loading skeletons, empty states, and error boundaries across pages.
- Accessibility pass: skip-to-content, keyboard focus rings, reduced-motion
  support, and labeled landmarks.

### Changed
- Re-themed from blue to an indigo + teal palette.
- Frontend migrated to Next.js 14 (App Router) + Tailwind CSS.

[Unreleased]: https://github.com/your-username/unified-solutions-platform
