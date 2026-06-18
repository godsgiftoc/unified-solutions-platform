"""Dashboard models: dashboards, tiles, filters."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDMixin


class DashboardStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class Dashboard(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "dashboards"
    __table_args__ = (UniqueConstraint("workspace_id", "slug"),)

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    slug: Mapped[str] = mapped_column(String(160))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(2000))
    layout_config: Mapped[dict] = mapped_column(JSONB, default=dict)  # grid cols/rowHeight/breakpoints
    default_filters: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[DashboardStatus] = mapped_column(
        Enum(DashboardStatus, name="dashboard_status"), default=DashboardStatus.DRAFT
    )
    version: Mapped[int] = mapped_column(Integer, default=1)  # optimistic concurrency
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))

    tiles: Mapped[list["Tile"]] = relationship(
        back_populates="dashboard", cascade="all, delete-orphan", order_by="Tile.position"
    )
    filters: Mapped[list["DashboardFilter"]] = relationship(
        back_populates="dashboard", cascade="all, delete-orphan", order_by="DashboardFilter.position"
    )


class TileType(str, enum.Enum):
    CHART = "chart"
    TEXT = "text"
    IMAGE = "image"
    DIVIDER = "divider"
    FILTER_CONTROL = "filter_control"


class Tile(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "tiles"

    dashboard_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("dashboards.id", ondelete="CASCADE"), index=True
    )
    tile_type: Mapped[TileType] = mapped_column(
        Enum(TileType, name="tile_type"), default=TileType.CHART
    )
    chart_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("charts.id", ondelete="SET NULL"))
    title: Mapped[str | None] = mapped_column(String(255))
    subtitle: Mapped[str | None] = mapped_column(String(512))
    layout: Mapped[dict] = mapped_column(JSONB, default=dict)  # react-grid-layout {i,x,y,w,h}
    config_override: Mapped[dict] = mapped_column(JSONB, default=dict)
    position: Mapped[int] = mapped_column(Integer, default=0)

    dashboard: Mapped[Dashboard] = relationship(back_populates="tiles")


class FilterType(str, enum.Enum):
    DATE_RANGE = "date_range"
    ORG_UNIT = "org_unit"
    SELECT = "select"
    MULTISELECT = "multiselect"
    TEXT = "text"
    NUMBER_RANGE = "number_range"


class DashboardFilter(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "dashboard_filters"
    __table_args__ = (UniqueConstraint("dashboard_id", "key"),)

    dashboard_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("dashboards.id", ondelete="CASCADE"), index=True
    )
    key: Mapped[str] = mapped_column(String(80))
    label: Mapped[str] = mapped_column(String(255))
    filter_type: Mapped[FilterType] = mapped_column(Enum(FilterType, name="filter_type"))
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    default_value: Mapped[dict] = mapped_column(JSONB, default=dict)
    position: Mapped[int] = mapped_column(Integer, default=0)

    dashboard: Mapped[Dashboard] = relationship(back_populates="filters")
