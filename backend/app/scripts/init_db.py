"""Create all tables directly from the models (P0 dev bootstrap).

For the quick first run before a baseline Alembic migration exists. For real
schema evolution, generate migrations with ``make revision m="..."`` and apply
with ``make migrate``.

Run with: ``python -m app.scripts.init_db``
"""

from __future__ import annotations

import app.models  # noqa: F401  (registers all tables on Base.metadata)
from app.core.db import Base, engine


def main() -> None:
    Base.metadata.create_all(engine)
    tables = ", ".join(sorted(Base.metadata.tables))
    print(f"created {len(Base.metadata.tables)} tables: {tables}")


if __name__ == "__main__":
    main()
