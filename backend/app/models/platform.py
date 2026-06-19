"""Platform / tenancy models: users, workspaces, memberships, permissions, shares, audit."""

from __future__ import annotations

import datetime as dt
import enum
import uuid

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.authorize import Action, Role
from app.core.db import Base, utcnow
from app.models.base import TimestampMixin, UUIDMixin


class AuthProvider(str, enum.Enum):
    GOOGLE_OIDC = "google_oidc"
    LOCAL = "local"


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    username: Mapped[str | None] = mapped_column(String(150), unique=True, index=True)
    full_name: Mapped[str | None] = mapped_column(String(255))
    avatar_url: Mapped[str | None] = mapped_column(String(1024))
    auth_provider: Mapped[AuthProvider] = mapped_column(
        Enum(AuthProvider, name="auth_provider"), default=AuthProvider.LOCAL
    )
    external_subject: Mapped[str | None] = mapped_column(String(255), index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))  # local/break-glass only
    is_org_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))

    memberships: Mapped[list[Membership]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="Membership.user_id",
    )


class Workspace(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "workspaces"

    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(2000))
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))

    memberships: Mapped[list[Membership]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan"
    )


class Membership(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "workspace_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[Role] = mapped_column(Enum(Role, name="workspace_role"), default=Role.VIEWER)
    invited_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))

    user: Mapped[User] = relationship(back_populates="memberships", foreign_keys=[user_id])
    workspace: Mapped[Workspace] = relationship(back_populates="memberships")


class ResourceType(str, enum.Enum):
    DASHBOARD = "dashboard"
    CONNECTION = "connection"
    DATASET = "dataset"
    WORKSPACE = "workspace"


class PrincipalType(str, enum.Enum):
    USER = "user"
    ROLE = "role"
    WORKSPACE = "workspace"
    LINK = "link"


class Permission(UUIDMixin, TimestampMixin, Base):
    """Object-level grant overriding/extending workspace role defaults."""

    __tablename__ = "permissions"
    __table_args__ = (Index("ix_permissions_resource", "resource_type", "resource_id"),)

    resource_type: Mapped[ResourceType] = mapped_column(Enum(ResourceType, name="resource_type"))
    resource_id: Mapped[uuid.UUID] = mapped_column()
    principal_type: Mapped[PrincipalType] = mapped_column(
        Enum(PrincipalType, name="principal_type")
    )
    principal_id: Mapped[uuid.UUID | None] = mapped_column()  # null for workspace-wide
    role_value: Mapped[Role | None] = mapped_column(Enum(Role, name="workspace_role"))
    level: Mapped[Action] = mapped_column(Enum(Action, name="permission_level"))
    granted_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    expires_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))


class Share(UUIDMixin, TimestampMixin, Base):
    """View-only share link for stakeholders (see plan §6.4)."""

    __tablename__ = "shares"

    dashboard_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("dashboards.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    access: Mapped[str] = mapped_column(String(20), default="view")
    filter_lock: Mapped[dict] = mapped_column(JSONB, default=dict)
    expires_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))


class AuditLog(UUIDMixin, Base):
    """Append-only record of security-relevant actions."""

    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_workspace_time", "workspace_id", "created_at"),
        Index("ix_audit_resource", "resource_type", "resource_id"),
    )

    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    workspace_id: Mapped[uuid.UUID | None] = mapped_column()
    action: Mapped[str] = mapped_column(String(100))
    resource_type: Mapped[str | None] = mapped_column(String(50))
    resource_id: Mapped[uuid.UUID | None] = mapped_column()
    extra: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
