"""Shared API dependencies: DB session + the authenticated Principal."""

from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.authorize import NotAuthorized, Principal, Role
from app.core.config import settings
from app.core.db import get_session
from app.core.security import SESSION_COOKIE, read_session
from app.models.platform import Membership, User

DEV_USER_EMAIL = "dev@local"


def _principal_from_user(session: Session, user: User) -> Principal:
    memberships = session.scalars(select(Membership).where(Membership.user_id == user.id)).all()
    return Principal(
        user_id=user.id,
        is_org_admin=user.is_org_admin,
        memberships={m.workspace_id: Role(m.role) for m in memberships},
    )


def get_principal(request: Request, session: Session = Depends(get_session)) -> Principal:
    """Resolve the caller from the signed session cookie.

    In development, falls back to the seeded ``dev@local`` user so the app is
    usable before the full OIDC flow is wired.
    """
    token = request.cookies.get(SESSION_COOKIE)
    user: User | None = None
    if token:
        uid = read_session(token)
        if uid:
            user = session.get(User, uuid.UUID(uid))

    # Opt-in dev convenience only: fall back to dev@local when explicitly enabled.
    # Off by default so a real login is required (including in development).
    if user is None and settings.dev_autologin and not settings.is_production:
        user = session.scalar(select(User).where(User.email == DEV_USER_EMAIL))

    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    return _principal_from_user(session, user)


def get_admin_principal(principal: Principal = Depends(get_principal)) -> Principal:
    """Require the caller to be a superadmin (org admin) — for user management."""
    if not principal.is_org_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin only")
    return principal


def map_not_authorized(exc: NotAuthorized) -> HTTPException:
    code = status.HTTP_404_NOT_FOUND if exc.as_not_found else status.HTTP_403_FORBIDDEN
    return HTTPException(status_code=code, detail=str(exc))


class WorkspaceRef:
    """Lightweight workspace-scoped resource for create-time authorization."""

    def __init__(self, workspace_id: uuid.UUID):
        self.workspace_id = workspace_id


def authorize_or_404(principal, action, resource) -> None:
    """Run the policy check, translating denials into HTTP errors."""
    from app.core.authorize import require

    try:
        require(principal, action, resource)
    except NotAuthorized as exc:
        raise map_not_authorized(exc) from exc
