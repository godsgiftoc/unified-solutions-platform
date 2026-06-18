"""Connector catalog endpoints — power the Data Services gallery."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_principal, get_session
from app.api.schemas import ConnectorCard, ConnectorOut
from app.connectors import all_definitions, get
from app.core.authorize import Principal
from app.models.ingestion import Connection, ConnectionStatus

router = APIRouter(prefix="/connectors", tags=["connectors"])


def _badge(defn, connection_count: int) -> str:
    """Gallery card badge. Every connector is open for connection; we only flag
    the ones that already have a live connection. Empty = no badge shown."""
    return "CONNECTED" if connection_count > 0 else ""


@router.get("", response_model=list[ConnectorCard])
def list_connectors(
    workspace_id: uuid.UUID | None = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[ConnectorCard]:
    """Gallery view: every connector + its computed status badge.

    If ``workspace_id`` is given, ``CONNECTED`` reflects live connections there.
    """
    counts: dict[str, int] = {}
    if workspace_id is not None:
        rows = session.execute(
            select(Connection.type, func.count())
            .where(
                Connection.workspace_id == workspace_id,
                Connection.status != ConnectionStatus.DISABLED,
            )
            .group_by(Connection.type)
        ).all()
        counts = {t: c for t, c in rows}

    cards: list[ConnectorCard] = []
    for defn in all_definitions():
        n = counts.get(defn.type, 0)
        cards.append(
            ConnectorCard(
                type=defn.type,
                name=defn.name,
                subtitle=defn.subtitle,
                icon=defn.icon,
                category=defn.category.value,
                badge=_badge(defn, n),
                connection_count=n,
            )
        )
    return cards


@router.get("/{connector_type}", response_model=ConnectorOut)
def get_connector(
    connector_type: str, principal: Principal = Depends(get_principal)
) -> ConnectorOut:
    """Full definition incl. field schema — drives the dynamic config form."""
    defn = get(connector_type)
    return ConnectorOut(
        type=defn.type,
        name=defn.name,
        kind=defn.kind.value,
        category=defn.category.value,
        maturity=defn.maturity.value,
        icon=defn.icon,
        subtitle=defn.subtitle,
        description=defn.description,
        fields=defn.fields,
        supports_incremental=defn.supports_incremental,
        supports_schema_discovery=defn.supports_schema_discovery,
    )
