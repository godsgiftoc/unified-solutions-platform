"""Connection CRUD + test/sync endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_principal, get_session, map_not_authorized
from app.api.schemas import (
    ConnectionCreate,
    ConnectionOut,
    ConnectionTestOut,
    ConnectionUpdate,
)
from app.connectors import get as get_connector
from app.connectors.base import Kind
from app.core.authorize import Action, NotAuthorized, Principal, require, scoped
from app.models.ingestion import Connection
from app.services import connection_service as svc

router = APIRouter(prefix="/connections", tags=["connections"])


def _to_out(conn: Connection) -> ConnectionOut:
    out = ConnectionOut.model_validate(conn)
    out.secret_fields = svc.masked_secret_fields(conn)
    return out


def _load(session: Session, principal: Principal, connection_id: uuid.UUID) -> Connection:
    conn = session.get(Connection, connection_id)
    if conn is None:
        raise HTTPException(status_code=404, detail="Connection not found")
    return conn


@router.get("", response_model=list[ConnectionOut])
def list_connections(
    workspace_id: uuid.UUID | None = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[ConnectionOut]:
    stmt = scoped(select(Connection), Connection.workspace_id, principal)
    if workspace_id is not None:
        stmt = stmt.where(Connection.workspace_id == workspace_id)
    conns = session.scalars(stmt.order_by(Connection.created_at.desc())).all()
    return [_to_out(c) for c in conns]


@router.post("", response_model=ConnectionOut, status_code=status.HTTP_201_CREATED)
def create_connection(
    payload: ConnectionCreate,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> ConnectionOut:
    # Must be a builder+ in the target workspace.
    try:
        require(
            principal,
            Action.EDIT,
            _WorkspaceRef(payload.workspace_id),
        )
    except NotAuthorized as exc:
        raise map_not_authorized(exc) from exc

    try:
        conn = svc.create_connection(
            session,
            connector_type=payload.type,
            name=payload.name,
            workspace_id=payload.workspace_id,
            owner_id=principal.user_id,
            config=payload.config,
            secrets=payload.secrets,
            schedule_cron=payload.schedule_cron,
            sync_mode=payload.sync_mode,
        )
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except svc.ValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    session.flush()
    return _to_out(conn)


@router.get("/{connection_id}", response_model=ConnectionOut)
def get_connection(
    connection_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> ConnectionOut:
    conn = _load(session, principal, connection_id)
    try:
        require(principal, Action.VIEW, conn)
    except NotAuthorized as exc:
        raise map_not_authorized(exc) from exc
    return _to_out(conn)


@router.patch("/{connection_id}", response_model=ConnectionOut)
def update_connection(
    connection_id: uuid.UUID,
    payload: ConnectionUpdate,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> ConnectionOut:
    conn = _load(session, principal, connection_id)
    try:
        require(principal, Action.EDIT, conn)
        conn = svc.apply_update(
            session,
            conn,
            name=payload.name,
            config=payload.config,
            secrets=payload.secrets,
            schedule_cron=payload.schedule_cron,
            sync_mode=payload.sync_mode,
            status=payload.status,
        )
    except NotAuthorized as exc:
        raise map_not_authorized(exc) from exc
    except svc.ValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _to_out(conn)


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_connection(
    connection_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> None:
    conn = _load(session, principal, connection_id)
    try:
        require(principal, Action.MANAGE, conn)
    except NotAuthorized as exc:
        raise map_not_authorized(exc) from exc
    session.delete(conn)


@router.post("/{connection_id}/test", response_model=ConnectionTestOut)
def test_connection(
    connection_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> ConnectionTestOut:
    """Run the connector's test_connection (native only).

    NOTE: P0 runs this inline for fast feedback; P1 moves it to a short-lived
    high-priority worker queue. Secrets are decrypted only here.
    """
    conn = _load(session, principal, connection_id)
    try:
        require(principal, Action.VIEW, conn)
    except NotAuthorized as exc:
        raise map_not_authorized(exc) from exc

    defn = get_connector(conn.type)
    if defn.kind != Kind.NATIVE or defn.extractor_factory is None:
        return ConnectionTestOut(
            ok=False, message=f"{defn.name} is configured but its sync engine is not available yet."
        )

    config = svc.decrypt_config(conn)
    extractor = defn.extractor_factory(config)
    result = extractor.test_connection()
    return ConnectionTestOut(ok=result.ok, message=result.message, details=result.details)


class _WorkspaceRef:
    """Lightweight workspace-scoped resource for create-time authorization."""

    def __init__(self, workspace_id: uuid.UUID):
        self.workspace_id = workspace_id
