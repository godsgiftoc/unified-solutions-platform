# Security Policy

## Reporting a problem

Please report security issues **privately** — do not open a public issue.

- Use GitHub's **"Report a vulnerability"** button under the repository's
  **Security** tab (Private Vulnerability Reporting), or
- Contact the maintainer directly through the address listed on their GitHub
  profile.

Please include: what you found, how to reproduce it, and the potential impact.
We aim to acknowledge reports within a few days and will keep you updated as we
investigate and ship a fix.

## Supported versions

This project is pre-1.0 and moves quickly. Fixes land on the `main` branch;
please test against the latest `main`.

## Handling notes for self-hosters

A few things to know before deploying this platform with real data:

- **Secrets** are envelope-encrypted at rest (`USP_MASTER_KEY`). Keep that key
  out of source control and rotate it if it is ever exposed. Never commit a real
  `.env` — the repo's `.gitignore` already excludes it.
- **SQL execution** is restricted to read-only `SELECT` statements (validated
  with sqlglot) against a read-only DuckDB binding.
- **Python notebooks** currently run in a subprocess kernel, **not** a hardened
  OS-level sandbox. Until container isolation (e.g. gVisor) is wired up as
  described in the architecture doc, treat notebook execution as trusted: do not
  expose notebooks to untrusted users on a shared deployment.
- Run behind your own authentication/network controls in production; the bundled
  dev auth fallback is for local development only.
