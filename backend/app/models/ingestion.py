"""Ingestion models: connections, encrypted secrets, sync runs, file uploads."""

from __future__ import annotations

import datetime as dt
import enum
import uuid

from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, LargeBinary, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDMixin


class ConnectionStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    DISABLED = "disabled"


class SyncMode(str, enum.Enum):
    FULL = "full"
    INCREMENTAL = "incremental"


class FreshnessStatus(str, enum.Enum):
    NEVER = "never"
    FRESH = "fresh"
    STALE = "stale"
    FAILING = "failing"


class Connection(UUIDMixin, TimestampMixin, Base):
    """A configured instance of a connector. Non-secret config lives here."""

    __tablename__ = "connections"

    type: Mapped[str] = mapped_column(String(50), index=True)  # connector type key
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    config: Mapped[dict] = mapped_column(JSONB, default=dict)  # non-secret only
    status: Mapped[ConnectionStatus] = mapped_column(
        Enum(ConnectionStatus, name="connection_status"), default=ConnectionStatus.DRAFT
    )
    schedule_cron: Mapped[str | None] = mapped_column(String(120))  # null = manual only
    sync_mode: Mapped[SyncMode] = mapped_column(
        Enum(SyncMode, name="sync_mode"), default=SyncMode.FULL
    )
    last_run_id: Mapped[uuid.UUID | None] = mapped_column()
    last_succeeded_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    freshness_status: Mapped[FreshnessStatus] = mapped_column(
        Enum(FreshnessStatus, name="freshness_status"), default=FreshnessStatus.NEVER
    )

    secret: Mapped["ConnectionSecret | None"] = relationship(
        back_populates="connection", cascade="all, delete-orphan", uselist=False
    )


class ConnectionSecret(UUIDMixin, Base):
    """Envelope-encrypted secret fields, isolated from non-secret config."""

    __tablename__ = "connection_secrets"

    connection_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("connections.id", ondelete="CASCADE"), unique=True, index=True
    )
    wrapped_dek: Mapped[bytes] = mapped_column(LargeBinary)
    fields: Mapped[dict] = mapped_column(JSONB, default=dict)  # {field_name: ciphertext}
    key_version: Mapped[int] = mapped_column(default=1)

    connection: Mapped[Connection] = relationship(back_populates="secret")


class SyncStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
    SKIPPED = "skipped"


class SyncTrigger(str, enum.Enum):
    MANUAL = "manual"
    SCHEDULE = "schedule"
    WEBHOOK = "webhook"


class SyncRun(UUIDMixin, Base):
    """One ingestion run; the history + freshness + structured-error record."""

    __tablename__ = "sync_runs"

    connection_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("connections.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[SyncStatus] = mapped_column(
        Enum(SyncStatus, name="sync_status"), default=SyncStatus.QUEUED, index=True
    )
    trigger: Mapped[SyncTrigger] = mapped_column(Enum(SyncTrigger, name="sync_trigger"))
    mode: Mapped[SyncMode] = mapped_column(Enum(SyncMode, name="sync_mode"))
    queued_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    records_read: Mapped[int] = mapped_column(BigInteger, default=0)
    records_written: Mapped[int] = mapped_column(BigInteger, default=0)
    records_rejected: Mapped[int] = mapped_column(BigInteger, default=0)
    bytes_read: Mapped[int] = mapped_column(BigInteger, default=0)
    cursor_state: Mapped[dict] = mapped_column(JSONB, default=dict)
    error_log: Mapped[dict | None] = mapped_column(JSONB)  # redacted structured error
    worker_id: Mapped[str | None] = mapped_column(String(120))


class UploadStatus(str, enum.Enum):
    UPLOADED = "uploaded"
    PARSED = "parsed"
    FAILED = "failed"


class FileUpload(UUIDMixin, TimestampMixin, Base):
    """An uploaded CSV/Excel file, landed in object storage and referenced by URI."""

    __tablename__ = "file_uploads"

    connection_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("connections.id", ondelete="SET NULL")
    )
    uploader_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    object_uri: Mapped[str] = mapped_column(String(1024))
    original_filename: Mapped[str] = mapped_column(String(512))
    content_type: Mapped[str | None] = mapped_column(String(120))
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    checksum: Mapped[str | None] = mapped_column(String(128))
    status: Mapped[UploadStatus] = mapped_column(
        Enum(UploadStatus, name="upload_status"), default=UploadStatus.UPLOADED
    )
