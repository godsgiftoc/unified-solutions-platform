"""SQLAlchemy ORM models for the Unified Solutions Platform.

One module per subsystem; this package re-exports everything so Alembic's
autogenerate sees the full metadata via ``from app.models import *``.
"""

from app.models.base import TimestampMixin, UUIDMixin
from app.models.compute import (
    Chart,
    Dataset,
    DatasetVersion,
    Notebook,
    NotebookCell,
    Query,
)
from app.models.dashboards import Dashboard, DashboardFilter, Tile
from app.models.ingestion import Connection, ConnectionSecret, FileUpload, SyncRun
from app.models.platform import AuditLog, Membership, Permission, Share, User, Workspace

__all__ = [
    "TimestampMixin",
    "UUIDMixin",
    "User",
    "Workspace",
    "Membership",
    "Permission",
    "Share",
    "AuditLog",
    "Connection",
    "ConnectionSecret",
    "SyncRun",
    "FileUpload",
    "Dataset",
    "DatasetVersion",
    "Query",
    "Chart",
    "Notebook",
    "NotebookCell",
    "Dashboard",
    "Tile",
    "DashboardFilter",
]
