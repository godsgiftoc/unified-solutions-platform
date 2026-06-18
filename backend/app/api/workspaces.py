"""Workspace endpoints (list the caller's workspaces)."""

from __future__ import annotations

import datetime as dt
import re
import uuid

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_principal, get_session
from app.core.authorize import Principal, Role, scoped
from app.models.platform import Membership, Workspace

router = APIRouter(prefix="/workspaces", tags=["workspaces"])
_slug_re = re.compile(r"[^a-z0-9]+")


class WorkspaceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    description: str | None
    created_at: dt.datetime
    role: str | None = None


class CreateWorkspace(BaseModel):
    name: str
    description: str | None = None


@router.get("", response_model=list[WorkspaceOut])
def list_workspaces(
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[WorkspaceOut]:
    rows = session.scalars(
        scoped(select(Workspace), Workspace.id, principal).order_by(Workspace.name)
    ).all()
    out = []
    for ws in rows:
        item = WorkspaceOut.model_validate(ws)
        role = principal.role_in(ws.id)
        item.role = role.value if role else ("org_admin" if principal.is_org_admin else None)
        out.append(item)
    return out


@router.post("", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
def create_workspace(
    payload: CreateWorkspace,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> WorkspaceOut:
    """Create a project (workspace) and make the creator its admin."""
    base = _slug_re.sub("-", payload.name.lower()).strip("-") or "project"
    slug, n = base, 1
    while session.scalar(select(Workspace.id).where(Workspace.slug == slug)):
        n += 1
        slug = f"{base}-{n}"
    ws = Workspace(
        slug=slug, name=payload.name, description=payload.description, created_by=principal.user_id
    )
    session.add(ws)
    session.flush()
    session.add(
        Membership(user_id=principal.user_id, workspace_id=ws.id, role=Role.WORKSPACE_ADMIN)
    )
    session.flush()
    item = WorkspaceOut.model_validate(ws)
    item.role = "workspace_admin"
    return item
