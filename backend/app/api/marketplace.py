"""Dashboard marketplace: published dashboards discoverable across all users.

Unlike the workspace-scoped dashboards list, the marketplace surfaces every
dashboard with status=published, so a dashboard built by one user can be
discovered and viewed by others.
"""

from __future__ import annotations

import datetime as dt
import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_principal, get_session
from app.core.authorize import Principal
from app.models.compute import Chart
from app.models.dashboards import Dashboard, DashboardStatus, Tile
from app.models.platform import User, Workspace

router = APIRouter(prefix="/marketplace", tags=["marketplace"])


class MarketplaceItem(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    owner_name: str | None
    workspace_id: uuid.UUID
    workspace_name: str | None
    workspace_description: str | None
    tile_count: int
    viz_types: list[str]
    updated_at: dt.datetime


@router.get("", response_model=list[MarketplaceItem])
def list_published(
    search: str | None = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[MarketplaceItem]:
    stmt = select(Dashboard).where(Dashboard.status == DashboardStatus.PUBLISHED)
    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.where(Dashboard.title.ilike(like))
    dashboards = session.scalars(stmt.order_by(Dashboard.updated_at.desc())).all()

    items: list[MarketplaceItem] = []
    for d in dashboards:
        owner = session.get(User, d.created_by) if d.created_by else None
        ws = session.get(Workspace, d.workspace_id)
        viz = {
            c.viz_type
            for t in d.tiles
            if t.chart_id and (c := session.get(Chart, t.chart_id)) is not None
        }
        items.append(
            MarketplaceItem(
                id=d.id, title=d.title, description=d.description,
                owner_name=owner.full_name or owner.email if owner else None,
                workspace_id=d.workspace_id,
                workspace_name=ws.name if ws else None,
                workspace_description=ws.description if ws else None,
                tile_count=len(d.tiles), viz_types=sorted(viz), updated_at=d.updated_at,
            )
        )
    return items
