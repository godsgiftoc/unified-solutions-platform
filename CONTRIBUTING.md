# Contributing to the Unified Solutions Platform

The Unified Solutions Platform (USP) is an **eHealth Africa** internal platform —
connect a source, shape it with SQL or Python, build dashboards, and share them.
This guide is for eHealth Africa engineers and authorized partners working on it:
bug reports, features, docs, tests, and connectors are all welcome.

Please keep all project spaces respectful and constructive.

## Ways to contribute

- **Report a bug** — open an issue with steps to reproduce.
- **Propose a feature** — open an issue describing the problem and your idea.
- **Send a pull request** — fix a bug, add a feature, improve docs or tests.
- **Add a connector** — drop one file under `backend/app/connectors/sources/`; it
  self-registers and appears in the Data Services gallery (zero frontend changes).

## Development setup

Requirements: Python 3.12+, Node 20+, Docker (for Postgres/Redis/MinIO).

```bash
# 1. Environment
cp .env.example .env
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"  # paste into USP_MASTER_KEY

# 2. Infra (Postgres, Redis, MinIO)
make up

# 3. Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
python -m app.scripts.init_db
python -m app.scripts.seed
uvicorn app.main:app --reload        # http://localhost:8000/docs

# 4. Frontend
cd ../frontend
npm install
npm run dev                          # http://localhost:5173
```

## Code style & checks

Run these before opening a PR — CI runs the same:

**Backend**
```bash
cd backend
ruff check .          # lint
ruff format .         # format
pytest                # tests
```

**Frontend**
```bash
cd frontend
npm run lint          # ESLint (next lint)
npm run typecheck     # tsc --noEmit
npm run build         # production build
```

Guidelines:
- Match the surrounding code's style, naming, and comment density.
- Keep secrets out of the repo. Never commit a real `.env`.
- Prefer small, focused PRs with a clear description of the change and why.
- Add or update tests for behavior changes where practical.

## Pull request process

1. Fork the repo and create a branch from `main` (e.g. `feat/csv-preview`).
2. Make your change; ensure lint, type-check, and tests pass locally.
3. Open a PR using the template. Link any related issue.
4. A maintainer will review. Address feedback, and we'll merge once green.

## Commit messages

Use clear, present-tense messages (e.g. `Add date-range dashboard filter`).
Conventional Commits (`feat:`, `fix:`, `docs:`…) are welcome but not required.

## License

By contributing, you agree that your contributions become part of this
proprietary project, © eHealth Africa (see [LICENSE](LICENSE)).
