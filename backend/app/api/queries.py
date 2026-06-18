"""SQL execution + saved-queries API for the SQL editor."""

from __future__ import annotations

import datetime as dt
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import WorkspaceRef, authorize_or_404, get_principal, get_session
from app.compute import engine
from app.core.authorize import Action, Principal, scoped
from app.models.compute import Query

router = APIRouter(prefix="/queries", tags=["queries"])


class RunQuery(BaseModel):
    sql: str
    limit: int = 1000


class SaveQuery(BaseModel):
    workspace_id: uuid.UUID
    name: str
    sql: str


class QueryOut(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    sql: str
    created_at: dt.datetime


def _out(q: Query) -> QueryOut:
    return QueryOut(id=q.id, workspace_id=q.workspace_id, name=q.name, sql=q.sql_text, created_at=q.created_at)


@router.post("/run")
def run_query(payload: RunQuery, principal: Principal = Depends(get_principal)) -> dict:
    """Execute a read-only SELECT and return columns + rows (capped)."""
    try:
        return engine.run_select(payload.sql, limit=payload.limit)
    except engine.QueryError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - surface DB errors to the editor
        raise HTTPException(400, f"Query failed: {exc}") from exc


@router.get("", response_model=list[QueryOut])
def list_queries(
    workspace_id: uuid.UUID | None = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[QueryOut]:
    stmt = scoped(select(Query), Query.workspace_id, principal)
    if workspace_id:
        stmt = stmt.where(Query.workspace_id == workspace_id)
    return [_out(q) for q in session.scalars(stmt.order_by(Query.created_at.desc())).all()]


@router.post("", response_model=QueryOut, status_code=status.HTTP_201_CREATED)
def save_query(
    payload: SaveQuery,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> QueryOut:
    authorize_or_404(principal, Action.EDIT, WorkspaceRef(payload.workspace_id))
    q = Query(workspace_id=payload.workspace_id, owner_id=principal.user_id, name=payload.name, sql_text=payload.sql)
    session.add(q)
    session.flush()
    return _out(q)


@router.delete("/{query_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_query(
    query_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> None:
    q = session.get(Query, query_id)
    if q is None:
        raise HTTPException(404, "Query not found")
    authorize_or_404(principal, Action.EDIT, q)
    session.delete(q)
