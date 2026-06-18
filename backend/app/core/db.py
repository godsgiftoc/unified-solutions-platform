"""Database engine, session factory, and the declarative Base.

Metadata DB only — no analytical scans run through this engine (those go to the
DuckDB-over-Parquet engine in the compute subsystem).
"""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Iterator

from sqlalchemy import DateTime, MetaData, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, mapped_column, sessionmaker
from uuid6 import uuid7

from app.core.config import settings

# Consistent constraint naming → clean, reversible Alembic migrations.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def uuid_pk() -> uuid.UUID:
    """Time-sortable UUIDv7 primary keys."""
    return uuid7()


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


# Reusable column helpers for the mixins in models.
def _timestamp_column(**kw):
    return mapped_column(DateTime(timezone=True), default=utcnow, **kw)


engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, class_=Session)


def get_session() -> Iterator[Session]:
    """FastAPI dependency yielding a transactional session."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
