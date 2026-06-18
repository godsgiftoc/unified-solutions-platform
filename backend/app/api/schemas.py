"""Pydantic request/response models for the API.

Secret handling lives here: secret fields are never echoed back — list/detail
responses replace them with a sentinel and a ``has_value`` flag.
"""

from __future__ import annotations

import datetime as dt
import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.connectors.base import ConnectorField


# ---- Connectors (catalog) ----
class ConnectorOut(BaseModel):
    type: str
    name: str
    kind: str
    category: str
    maturity: str
    icon: str
    subtitle: str
    description: str
    fields: list[ConnectorField]
    supports_incremental: bool
    supports_schema_discovery: bool


class ConnectorCard(BaseModel):
    """Gallery card view: definition + computed status badge for the workspace."""

    type: str
    name: str
    subtitle: str
    icon: str
    category: str
    badge: str  # CONNECTED | BETA | AVAILABLE | COMING SOON
    connection_count: int = 0


# ---- Connections ----
class ConnectionCreate(BaseModel):
    type: str
    name: str
    workspace_id: uuid.UUID
    config: dict = Field(default_factory=dict)  # non-secret fields
    secrets: dict[str, str] = Field(default_factory=dict)  # plaintext secret fields (write-only)
    schedule_cron: str | None = None
    sync_mode: str = "full"


class ConnectionUpdate(BaseModel):
    name: str | None = None
    config: dict | None = None
    secrets: dict[str, str] | None = None  # sentinel value ⇒ leave unchanged
    schedule_cron: str | None = None
    sync_mode: str | None = None
    status: str | None = None


class ConnectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    name: str
    slug: str
    workspace_id: uuid.UUID
    config: dict
    status: str
    schedule_cron: str | None
    sync_mode: str
    freshness_status: str
    last_succeeded_at: dt.datetime | None
    created_at: dt.datetime
    # Masked secret fields: {field_name: has_value}
    secret_fields: dict[str, bool] = Field(default_factory=dict)


class ConnectionTestOut(BaseModel):
    ok: bool
    message: str
    details: dict | None = None
