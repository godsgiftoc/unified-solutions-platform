"""Compute models: datasets (+versions), saved queries, charts, notebooks (+cells)."""

from __future__ import annotations

import datetime as dt
import enum
import uuid

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDMixin


class DatasetKind(str, enum.Enum):
    RAW = "raw"  # produced by ingestion
    SQL = "sql"  # saved SQL query/view
    NOTEBOOK = "notebook"  # materialized notebook output


class Dataset(UUIDMixin, TimestampMixin, Base):
    """The queryable unit charts bind to. Never a raw physical schema directly."""

    __tablename__ = "datasets"
    __table_args__ = (UniqueConstraint("workspace_id", "slug"),)

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    slug: Mapped[str] = mapped_column(String(160))
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(2000))
    kind: Mapped[DatasetKind] = mapped_column(Enum(DatasetKind, name="dataset_kind"))
    current_version_id: Mapped[uuid.UUID | None] = mapped_column()
    owner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    tags: Mapped[list] = mapped_column(JSONB, default=list)
    source_ref: Mapped[dict] = mapped_column(JSONB, default=dict)  # ingestion/notebook provenance

    versions: Mapped[list[DatasetVersion]] = relationship(
        back_populates="dataset",
        cascade="all, delete-orphan",
        foreign_keys="DatasetVersion.dataset_id",
    )


class Materialization(str, enum.Enum):
    VIEW = "view"
    MATERIALIZED = "materialized"
    SNAPSHOT = "snapshot"


class BuildStatus(str, enum.Enum):
    PENDING = "pending"
    READY = "ready"
    FAILED = "failed"


class DatasetVersion(UUIDMixin, Base):
    """Immutable version: definition + resolved schema + physical pointer."""

    __tablename__ = "dataset_versions"

    dataset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("datasets.id", ondelete="CASCADE"), index=True
    )
    version_no: Mapped[int] = mapped_column(Integer, default=1)
    definition: Mapped[dict] = mapped_column(JSONB, default=dict)  # sql / provenance / raw pointer
    physical_uri: Mapped[str | None] = mapped_column(String(1024))  # parquet path
    schema: Mapped[list] = mapped_column(JSONB, default=list)  # [{name,type,nullable}]
    materialization: Mapped[Materialization] = mapped_column(
        Enum(Materialization, name="materialization"), default=Materialization.VIEW
    )
    row_count_estimate: Mapped[int | None] = mapped_column(BigInteger)
    bytes: Mapped[int | None] = mapped_column(BigInteger)
    build_status: Mapped[BuildStatus] = mapped_column(
        Enum(BuildStatus, name="build_status"), default=BuildStatus.PENDING
    )
    built_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    built_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: dt.datetime.now(dt.UTC)
    )

    dataset: Mapped[Dataset] = relationship(back_populates="versions", foreign_keys=[dataset_id])


class Query(UUIDMixin, TimestampMixin, Base):
    """A saved SQL-editor document (may or may not also be a dataset)."""

    __tablename__ = "queries"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(255))
    sql_text: Mapped[str] = mapped_column(Text)
    default_params: Mapped[dict] = mapped_column(JSONB, default=dict)
    last_run_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))


class ChartKind(str, enum.Enum):
    QUERY_CHART = "query_chart"
    NOTEBOOK_FIGURE = "notebook_figure"


class Chart(UUIDMixin, TimestampMixin, Base):
    """A reusable visualization bound to a dataset/query/notebook cell."""

    __tablename__ = "charts"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(255))
    chart_kind: Mapped[ChartKind] = mapped_column(Enum(ChartKind, name="chart_kind"))
    dataset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("datasets.id"))
    dataset_version_id: Mapped[uuid.UUID | None] = mapped_column()  # null = follow latest
    query_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("queries.id"))
    notebook_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("notebooks.id"))
    cell_id: Mapped[uuid.UUID | None] = mapped_column()
    spec: Mapped[dict] = mapped_column(JSONB, default=dict)  # renderer-agnostic encoding spec
    viz_type: Mapped[str] = mapped_column(String(40), default="table")
    refresh_policy: Mapped[dict] = mapped_column(JSONB, default=dict)
    cache_ttl_s: Mapped[int] = mapped_column(Integer, default=300)


class NotebookState(str, enum.Enum):
    IDLE = "idle"
    RUNNING = "running"


class Notebook(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "notebooks"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(255))
    kernel_image: Mapped[str] = mapped_column(String(255), default="usp/kernel:latest")
    state: Mapped[NotebookState] = mapped_column(
        Enum(NotebookState, name="notebook_state"), default=NotebookState.IDLE
    )
    last_active_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))

    cells: Mapped[list[NotebookCell]] = relationship(
        back_populates="notebook", cascade="all, delete-orphan", order_by="NotebookCell.position"
    )


class CellType(str, enum.Enum):
    CODE = "code"
    MARKDOWN = "markdown"


class NotebookCell(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "notebook_cells"
    __table_args__ = (UniqueConstraint("notebook_id", "position"),)

    notebook_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("notebooks.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer)
    cell_type: Mapped[CellType] = mapped_column(
        Enum(CellType, name="cell_type"), default=CellType.CODE
    )
    source: Mapped[str] = mapped_column(Text, default="")
    outputs: Mapped[list] = mapped_column(JSONB, default=list)
    execution_count: Mapped[int | None] = mapped_column(Integer)
    last_run_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))

    notebook: Mapped[Notebook] = relationship(back_populates="cells")
