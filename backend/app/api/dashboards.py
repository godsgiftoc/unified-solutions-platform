"""Dashboards API: CRUD, tiles, bulk layout, and publish."""

from __future__ import annotations

import datetime as dt
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

import secrets

from app.api.deps import WorkspaceRef, authorize_or_404, get_principal, get_session
from app.core.authorize import Action, Principal, scoped
from app.models.compute import Chart
from app.models.dashboards import Dashboard, DashboardStatus, Tile, TileType
from app.models.platform import Share

router = APIRouter(prefix="/dashboards", tags=["dashboards"])
_slug_re = re.compile(r"[^a-z0-9]+")


def _slug(session: Session, workspace_id: uuid.UUID, title: str) -> str:
    base = _slug_re.sub("-", title.lower()).strip("-") or "dashboard"
    slug, n = base, 1
    while session.scalar(
        select(Dashboard.id).where(Dashboard.workspace_id == workspace_id, Dashboard.slug == slug)
    ):
        n += 1
        slug = f"{base}-{n}"
    return slug


class DashboardOut(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    slug: str
    title: str
    description: str | None
    status: str
    version: int
    tile_count: int
    viz_types: list[str]
    updated_at: dt.datetime


class TileOut(BaseModel):
    id: uuid.UUID
    chart_id: uuid.UUID | None
    title: str | None
    layout: dict
    viz_type: str | None = None
    sql: str | None = None
    encoding: dict | None = None


class DashboardDetail(DashboardOut):
    tiles: list[TileOut]


class CreateDashboard(BaseModel):
    workspace_id: uuid.UUID
    title: str
    description: str | None = None


class UpdateDashboard(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    layout_config: dict | None = None


class AddTile(BaseModel):
    chart_id: uuid.UUID
    title: str | None = None
    layout: dict = Field(default_factory=dict)


class LayoutItem(BaseModel):
    id: uuid.UUID
    layout: dict


def _out(session: Session, d: Dashboard) -> DashboardOut:
    viz = sorted(
        {c.viz_type for t in d.tiles if t.chart_id and (c := session.get(Chart, t.chart_id)) is not None}
    )
    return DashboardOut(
        id=d.id, workspace_id=d.workspace_id, slug=d.slug, title=d.title,
        description=d.description, status=d.status.value, version=d.version,
        tile_count=len(d.tiles), viz_types=viz, updated_at=d.updated_at,
    )


@router.get("", response_model=list[DashboardOut])
def list_dashboards(
    workspace_id: uuid.UUID | None = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[DashboardOut]:
    stmt = scoped(select(Dashboard), Dashboard.workspace_id, principal)
    if workspace_id:
        stmt = stmt.where(Dashboard.workspace_id == workspace_id)
    return [_out(session, d) for d in session.scalars(stmt.order_by(Dashboard.updated_at.desc())).all()]


@router.post("", response_model=DashboardOut, status_code=status.HTTP_201_CREATED)
def create_dashboard(
    payload: CreateDashboard,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> DashboardOut:
    authorize_or_404(principal, Action.EDIT, WorkspaceRef(payload.workspace_id))
    d = Dashboard(
        workspace_id=payload.workspace_id, slug=_slug(session, payload.workspace_id, payload.title),
        title=payload.title, description=payload.description,
        created_by=principal.user_id, updated_by=principal.user_id,
        layout_config={"cols": 12, "rowHeight": 40},
    )
    session.add(d)
    session.flush()
    return _out(session, d)


@router.get("/{dashboard_id}", response_model=DashboardDetail)
def get_dashboard(
    dashboard_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> DashboardDetail:
    d = session.get(Dashboard, dashboard_id)
    if d is None:
        raise HTTPException(404, "Dashboard not found")
    authorize_or_404(principal, Action.VIEW, d)
    tiles = []
    for t in d.tiles:
        chart = session.get(Chart, t.chart_id) if t.chart_id else None
        tiles.append(
            TileOut(
                id=t.id, chart_id=t.chart_id, title=t.title or (chart.name if chart else None),
                layout=t.layout, viz_type=chart.viz_type if chart else None,
                sql=chart.spec.get("sql") if chart else None,
                encoding=chart.spec.get("encoding") if chart else None,
            )
        )
    return DashboardDetail(**_out(session, d).model_dump(), tiles=tiles)


@router.patch("/{dashboard_id}", response_model=DashboardOut)
def update_dashboard(
    dashboard_id: uuid.UUID,
    payload: UpdateDashboard,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> DashboardOut:
    d = session.get(Dashboard, dashboard_id)
    if d is None:
        raise HTTPException(404, "Dashboard not found")
    authorize_or_404(principal, Action.EDIT, d)
    if payload.title is not None:
        d.title = payload.title
    if payload.description is not None:
        d.description = payload.description
    if payload.layout_config is not None:
        d.layout_config = payload.layout_config
    if payload.status is not None:
        d.status = DashboardStatus(payload.status)
    d.updated_by = principal.user_id
    return _out(session, d)


@router.post("/{dashboard_id}/tiles", response_model=TileOut, status_code=status.HTTP_201_CREATED)
def add_tile(
    dashboard_id: uuid.UUID,
    payload: AddTile,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> TileOut:
    d = session.get(Dashboard, dashboard_id)
    if d is None:
        raise HTTPException(404, "Dashboard not found")
    authorize_or_404(principal, Action.EDIT, d)
    chart = session.get(Chart, payload.chart_id)
    if chart is None or chart.workspace_id != d.workspace_id:
        raise HTTPException(400, "Chart not found in this workspace")
    pos = len(d.tiles)
    layout = payload.layout or {"x": (pos * 4) % 12, "y": 999, "w": 4, "h": 6}
    tile = Tile(
        dashboard_id=d.id, tile_type=TileType.CHART, chart_id=chart.id,
        title=payload.title or chart.name, layout=layout, position=pos,
    )
    session.add(tile)
    d.version += 1
    session.flush()
    return TileOut(id=tile.id, chart_id=chart.id, title=tile.title, layout=tile.layout,
                   viz_type=chart.viz_type, sql=chart.spec.get("sql"),
                   encoding=chart.spec.get("encoding"))


@router.put("/{dashboard_id}/layout", response_model=DashboardOut)
def save_layout(
    dashboard_id: uuid.UUID,
    items: list[LayoutItem],
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> DashboardOut:
    d = session.get(Dashboard, dashboard_id)
    if d is None:
        raise HTTPException(404, "Dashboard not found")
    authorize_or_404(principal, Action.EDIT, d)
    by_id = {t.id: t for t in d.tiles}
    for item in items:
        if item.id in by_id:
            by_id[item.id].layout = item.layout
    d.version += 1
    d.updated_by = principal.user_id
    return _out(session, d)


@router.delete("/{dashboard_id}/tiles/{tile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tile(
    dashboard_id: uuid.UUID,
    tile_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> None:
    d = session.get(Dashboard, dashboard_id)
    if d is None:
        raise HTTPException(404, "Dashboard not found")
    authorize_or_404(principal, Action.EDIT, d)
    tile = session.get(Tile, tile_id)
    if tile and tile.dashboard_id == d.id:
        session.delete(tile)
        d.version += 1


@router.delete("/{dashboard_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dashboard(
    dashboard_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> None:
    d = session.get(Dashboard, dashboard_id)
    if d is None:
        raise HTTPException(404, "Dashboard not found")
    authorize_or_404(principal, Action.MANAGE, d)
    session.delete(d)


# ---------------------------------------------------------------------------
# View-only share links (see plan §6.4). The public read endpoint lives in
# app/api/public.py and requires no authentication.
# ---------------------------------------------------------------------------
class ShareOut(BaseModel):
    token: str
    url_path: str


def _active_share(session: Session, dashboard_id: uuid.UUID) -> Share | None:
    return session.scalar(
        select(Share).where(Share.dashboard_id == dashboard_id, Share.revoked_at.is_(None))
    )


@router.get("/{dashboard_id}/share", response_model=ShareOut | None)
def get_share(
    dashboard_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> ShareOut | None:
    d = session.get(Dashboard, dashboard_id)
    if d is None:
        raise HTTPException(404, "Dashboard not found")
    authorize_or_404(principal, Action.VIEW, d)
    share = _active_share(session, dashboard_id)
    return ShareOut(token=share.token_hash, url_path=f"/share/{share.token_hash}") if share else None


@router.post("/{dashboard_id}/share", response_model=ShareOut)
def create_share(
    dashboard_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> ShareOut:
    """Create (or return the existing) view-only share link for a dashboard."""
    d = session.get(Dashboard, dashboard_id)
    if d is None:
        raise HTTPException(404, "Dashboard not found")
    authorize_or_404(principal, Action.EDIT, d)
    share = _active_share(session, dashboard_id)
    if share is None:
        # NOTE: stored verbatim so the link is stable and retrievable in this MVP.
        # A hardened deployment should store only a hash and compare on lookup.
        token = secrets.token_urlsafe(24)
        share = Share(
            dashboard_id=dashboard_id, token_hash=token, access="view",
            created_by=principal.user_id,
        )
        session.add(share)
        session.flush()
    return ShareOut(token=share.token_hash, url_path=f"/share/{share.token_hash}")


@router.delete("/{dashboard_id}/share", status_code=status.HTTP_204_NO_CONTENT)
def revoke_share(
    dashboard_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> None:
    d = session.get(Dashboard, dashboard_id)
    if d is None:
        raise HTTPException(404, "Dashboard not found")
    authorize_or_404(principal, Action.EDIT, d)
    share = _active_share(session, dashboard_id)
    if share is not None:
        share.revoked_at = dt.datetime.now(dt.timezone.utc)
