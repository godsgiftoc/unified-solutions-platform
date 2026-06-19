"""Authentication endpoints.

Login is username + password (PBKDF2-hashed). There is no public sign-up — a
superadmin creates accounts via the admin endpoints. ``/me`` returns the current
principal's identity and workspace memberships.
"""

from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_principal, get_session
from app.core.authorize import Principal
from app.core.config import settings
from app.core.ratelimit import rate_limit_login
from app.core.security import SESSION_COOKIE, issue_session, verify_password
from app.models.platform import Membership, User

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str
    password: str


class MeOut(BaseModel):
    user_id: str
    username: str | None
    email: str
    full_name: str | None
    is_org_admin: bool
    memberships: list[dict]


def _set_session_cookie(response: Response, user_id: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        issue_session(user_id),
        httponly=True,
        samesite="lax",
        secure=settings.is_production,
    )


@router.post("/login", response_model=MeOut)
def login(
    payload: LoginIn,
    response: Response,
    session: Session = Depends(get_session),
    _rl: None = Depends(rate_limit_login),
) -> MeOut:
    ident = payload.username.strip()
    # Accept either the username or the email as the identifier.
    user = session.scalar(
        select(User).where(
            (func.lower(User.username) == ident.lower()) | (func.lower(User.email) == ident.lower())
        )
    )
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    user.last_login_at = dt.datetime.now(dt.UTC)
    _set_session_cookie(response, str(user.id))
    return _me_out(session, user)


@router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}


def _me_out(session: Session, user: User) -> MeOut:
    rows = session.scalars(select(Membership).where(Membership.user_id == user.id)).all()
    return MeOut(
        user_id=str(user.id),
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        is_org_admin=user.is_org_admin,
        memberships=[{"workspace_id": str(m.workspace_id), "role": m.role.value} for m in rows],
    )


@router.get("/me", response_model=MeOut)
def me(
    principal: Principal = Depends(get_principal), session: Session = Depends(get_session)
) -> MeOut:
    user = session.get(User, principal.user_id)
    return _me_out(session, user)
