"""Charts API: save a query + visual encoding as a reusable chart, fetch its data."""

from __future__ import annotations

import datetime as dt
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import WorkspaceRef, authorize_or_404, get_principal, get_session
from app.compute import engine
from app.core.authorize import Action, Principal, scoped
from app.models.compute import Chart, ChartKind

router = APIRouter(prefix="/charts", tags=["charts"])


class ChartCreate(BaseModel):
    workspace_id: uuid.UUID
    name: str
    sql: str
    viz_type: str = "bar"
    spec: dict = Field(default_factory=dict)  # encoding: {x, y, series, ...}


class ChartUpdate(BaseModel):
    name: str | None = None
    viz_type: str | None = None
    sql: str | None = None
    spec: dict | None = None  # encoding


class ChartOut(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    viz_type: str
    sql: str
    spec: dict
    created_at: dt.datetime


def _to_out(c: Chart) -> ChartOut:
    return ChartOut(
        id=c.id, workspace_id=c.workspace_id, name=c.name, viz_type=c.viz_type,
        sql=c.spec.get("sql", ""), spec=c.spec.get("encoding", {}), created_at=c.created_at,
    )


@router.get("", response_model=list[ChartOut])
def list_charts(
    workspace_id: uuid.UUID | None = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[ChartOut]:
    stmt = scoped(select(Chart), Chart.workspace_id, principal)
    if workspace_id:
        stmt = stmt.where(Chart.workspace_id == workspace_id)
    return [_to_out(c) for c in session.scalars(stmt.order_by(Chart.created_at.desc())).all()]


@router.post("", response_model=ChartOut, status_code=status.HTTP_201_CREATED)
def create_chart(
    payload: ChartCreate,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> ChartOut:
    authorize_or_404(principal, Action.EDIT, WorkspaceRef(payload.workspace_id))
    try:
        engine.assert_read_only(payload.sql)
    except engine.QueryError as exc:
        raise HTTPException(422, str(exc)) from exc
    chart = Chart(
        workspace_id=payload.workspace_id, owner_id=principal.user_id, name=payload.name,
        chart_kind=ChartKind.QUERY_CHART, viz_type=payload.viz_type,
        spec={"sql": payload.sql, "encoding": payload.spec},
    )
    session.add(chart)
    session.flush()
    return _to_out(chart)


@router.get("/{chart_id}", response_model=ChartOut)
def get_chart(
    chart_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> ChartOut:
    chart = session.get(Chart, chart_id)
    if chart is None:
        raise HTTPException(404, "Chart not found")
    authorize_or_404(principal, Action.VIEW, chart)
    return _to_out(chart)


@router.patch("/{chart_id}", response_model=ChartOut)
def update_chart(
    chart_id: uuid.UUID,
    payload: ChartUpdate,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> ChartOut:
    chart = session.get(Chart, chart_id)
    if chart is None:
        raise HTTPException(404, "Chart not found")
    authorize_or_404(principal, Action.EDIT, chart)
    if payload.sql is not None:
        try:
            engine.assert_read_only(payload.sql)
        except engine.QueryError as exc:
            raise HTTPException(422, str(exc)) from exc
    # Rebuild spec so SQLAlchemy detects the JSON change.
    spec = dict(chart.spec)
    if payload.sql is not None:
        spec["sql"] = payload.sql
    if payload.spec is not None:
        spec["encoding"] = payload.spec
    chart.spec = spec
    if payload.name is not None:
        chart.name = payload.name
    if payload.viz_type is not None:
        chart.viz_type = payload.viz_type
    return _to_out(chart)


@router.post("/{chart_id}/data")
def chart_data(
    chart_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> dict:
    """Run the chart's query and return rows for rendering."""
    chart = session.get(Chart, chart_id)
    if chart is None:
        raise HTTPException(404, "Chart not found")
    authorize_or_404(principal, Action.VIEW, chart)
    try:
        return engine.run_select(chart.spec.get("sql", "SELECT 1"))
    except engine.QueryError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.delete("/{chart_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chart(
    chart_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> None:
    chart = session.get(Chart, chart_id)
    if chart is None:
        raise HTTPException(404, "Chart not found")
    authorize_or_404(principal, Action.EDIT, chart)
    session.delete(chart)
