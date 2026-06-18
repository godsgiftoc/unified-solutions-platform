"""Public, unauthenticated read endpoints — view-only dashboard share links.

A share link carries an opaque token. Anyone with the token can read the
dashboard and its rendered data (view-only), but nothing else: there is no
principal, no workspace scope leak, and no mutation surface here.
"""

from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_session
from app.compute import engine
from app.models.compute import Chart
from app.models.dashboards import Dashboard
from app.models.platform import Share

router = APIRouter(prefix="/public", tags=["public"])


class PublicTile(BaseModel):
    id: str
    title: str | None
    viz_type: str | None = None
    encoding: dict | None = None
    layout: dict
    data: dict | None = None


class PublicDashboard(BaseModel):
    title: str
    description: str | None
    tiles: list[PublicTile]


@router.get("/dashboards/{token}", response_model=PublicDashboard)
def public_dashboard(token: str, session: Session = Depends(get_session)) -> PublicDashboard:
    share = session.scalar(select(Share).where(Share.token_hash == token))
    if share is None or share.revoked_at is not None:
        raise HTTPException(404, "This link is invalid or has been revoked")
    if share.expires_at is not None and share.expires_at < dt.datetime.now(dt.timezone.utc):
        raise HTTPException(404, "This link has expired")

    d = session.get(Dashboard, share.dashboard_id)
    if d is None:
        raise HTTPException(404, "Dashboard not found")

    tiles: list[PublicTile] = []
    for t in d.tiles:
        chart = session.get(Chart, t.chart_id) if t.chart_id else None
        data = None
        if chart is not None:
            try:
                data = engine.run_select(chart.spec.get("sql", "SELECT 1"))
            except engine.QueryError:
                data = None
        tiles.append(
            PublicTile(
                id=str(t.id),
                title=t.title or (chart.name if chart else None),
                viz_type=chart.viz_type if chart else None,
                encoding=chart.spec.get("encoding") if chart else None,
                layout=t.layout,
                data=data,
            )
        )
    return PublicDashboard(title=d.title, description=d.description, tiles=tiles)
