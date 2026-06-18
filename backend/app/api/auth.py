"""Authentication endpoints.

P0 ships a dev-login (email-only) so the app is usable immediately; the full
Google OIDC + Redis-session flow lands in a later pass. ``/me`` returns the
current principal's identity and workspace memberships.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_principal, get_session
from app.core.authorize import Principal
from app.core.config import settings
from app.core.security import SESSION_COOKIE, issue_session
from app.models.platform import Membership, User

router = APIRouter(prefix="/auth", tags=["auth"])


class DevLogin(BaseModel):
    email: EmailStr


class MeOut(BaseModel):
    user_id: str
    email: str
    full_name: str | None
    is_org_admin: bool
    memberships: list[dict]


@router.post("/dev-login")
def dev_login(
    payload: DevLogin, response: Response, session: Session = Depends(get_session)
) -> dict:
    if settings.is_production:
        raise HTTPException(status_code=404, detail="Not found")
    user = session.scalar(select(User).where(User.email == payload.email))
    if user is None:
        raise HTTPException(status_code=404, detail="Unknown user; run `make seed` first")
    response.set_cookie(
        SESSION_COOKIE,
        issue_session(str(user.id)),
        httponly=True,
        samesite="lax",
        secure=settings.is_production,
    )
    return {"ok": True, "user_id": str(user.id)}


@router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}


@router.get("/me", response_model=MeOut)
def me(
    principal: Principal = Depends(get_principal), session: Session = Depends(get_session)
) -> MeOut:
    user = session.get(User, principal.user_id)
    rows = session.scalars(select(Membership).where(Membership.user_id == principal.user_id)).all()
    return MeOut(
        user_id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        is_org_admin=user.is_org_admin,
        memberships=[{"workspace_id": str(m.workspace_id), "role": m.role.value} for m in rows],
    )
