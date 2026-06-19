"""Superadmin user management (access control).

Only an org admin (superadmin) may list, create, update or deactivate users.
There is no public sign-up: the superadmin provisions every account here.
"""

from __future__ import annotations

import datetime as dt
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_admin_principal, get_session
from app.core.authorize import Principal
from app.core.security import hash_password
from app.models.platform import AuthProvider, User

router = APIRouter(prefix="/admin", tags=["admin"])


class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str | None = None
    email: str | None = None
    is_org_admin: bool = False


class UserUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    is_org_admin: bool | None = None
    is_active: bool | None = None
    password: str | None = None  # set => reset this user's password


class UserOut(BaseModel):
    id: str
    username: str | None
    email: str
    full_name: str | None
    is_org_admin: bool
    is_active: bool
    last_login_at: dt.datetime | None
    created_at: dt.datetime


def _out(u: User) -> UserOut:
    return UserOut(
        id=str(u.id),
        username=u.username,
        email=u.email,
        full_name=u.full_name,
        is_org_admin=u.is_org_admin,
        is_active=u.is_active,
        last_login_at=u.last_login_at,
        created_at=u.created_at,
    )


@router.get("/users", response_model=list[UserOut])
def list_users(
    _: Principal = Depends(get_admin_principal),
    session: Session = Depends(get_session),
) -> list[UserOut]:
    users = session.scalars(select(User).order_by(User.created_at)).all()
    return [_out(u) for u in users]


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(
    payload: UserCreate,
    _: Principal = Depends(get_admin_principal),
    session: Session = Depends(get_session),
) -> UserOut:
    username = payload.username.strip()
    if not username or not payload.password:
        raise HTTPException(422, "Username and password are required")
    # email is required + unique on the model; synthesize a stable one if omitted.
    email = (payload.email or f"{username}@users.local").strip().lower()
    if session.scalar(select(User).where(func.lower(User.username) == username.lower())):
        raise HTTPException(409, "That username is already taken")
    if session.scalar(select(User).where(func.lower(User.email) == email)):
        raise HTTPException(409, "That email is already in use")
    user = User(
        username=username,
        email=email,
        full_name=payload.full_name,
        auth_provider=AuthProvider.LOCAL,
        password_hash=hash_password(payload.password),
        is_org_admin=payload.is_org_admin,
        is_active=True,
    )
    session.add(user)
    session.flush()
    return _out(user)


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    admin: Principal = Depends(get_admin_principal),
    session: Session = Depends(get_session),
) -> UserOut:
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    # Guard against an admin locking themselves out.
    if user.id == admin.user_id:
        if payload.is_active is False:
            raise HTTPException(422, "You can't deactivate your own account")
        if payload.is_org_admin is False:
            raise HTTPException(422, "You can't remove your own superadmin access")
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.email is not None:
        user.email = payload.email.strip().lower()
    if payload.is_org_admin is not None:
        user.is_org_admin = payload.is_org_admin
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.password:
        user.password_hash = hash_password(payload.password)
    session.flush()
    return _out(user)


@router.delete("/users/{user_id}", response_model=UserOut)
def deactivate_user(
    user_id: uuid.UUID,
    admin: Principal = Depends(get_admin_principal),
    session: Session = Depends(get_session),
) -> UserOut:
    """Deactivate (not hard-delete, to preserve owned resources)."""
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    if user.id == admin.user_id:
        raise HTTPException(422, "You can't deactivate your own account")
    user.is_active = False
    session.flush()
    return _out(user)
