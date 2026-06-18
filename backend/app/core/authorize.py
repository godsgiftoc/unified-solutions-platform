"""Authorization spine (see plan §7).

Two primitives every endpoint uses:

- ``authorize(user, action, resource)`` — the single policy decision point.
  Resolution order: org-admin → explicit per-resource grant → workspace role
  default → deny.
- ``scoped(stmt, model, principal)`` — always injects ``workspace_id IN (...)``
  so list endpoints can't leak cross-workspace rows even if a dev forgets a
  filter.

Resources outside a user's visibility should surface as 404 (not 403) to avoid
leaking existence — callers use ``require()`` / ``NotAuthorized`` accordingly.
"""

from __future__ import annotations

import enum
import uuid
from dataclasses import dataclass, field
from typing import Protocol

from sqlalchemy import Select
from sqlalchemy.sql.elements import ColumnElement


class Role(str, enum.Enum):
    """Workspace-scoped roles, ordered by privilege."""

    VIEWER = "viewer"
    BUILDER = "builder"
    WORKSPACE_ADMIN = "workspace_admin"


# Privilege ranking for "at least" checks.
_ROLE_RANK = {Role.VIEWER: 0, Role.BUILDER: 1, Role.WORKSPACE_ADMIN: 2}


class Action(str, enum.Enum):
    VIEW = "view"
    EDIT = "edit"
    MANAGE = "manage"


# Minimum workspace role that grants an action by default (before per-resource
# grants are considered).
_ACTION_MIN_ROLE = {
    Action.VIEW: Role.VIEWER,
    Action.EDIT: Role.BUILDER,
    Action.MANAGE: Role.WORKSPACE_ADMIN,
}


@dataclass
class Principal:
    """The authenticated caller, resolved from the session and cached per request."""

    user_id: uuid.UUID
    is_org_admin: bool = False
    # workspace_id -> role
    memberships: dict[uuid.UUID, Role] = field(default_factory=dict)

    @property
    def workspace_ids(self) -> list[uuid.UUID]:
        return list(self.memberships.keys())

    def role_in(self, workspace_id: uuid.UUID) -> Role | None:
        return self.memberships.get(workspace_id)


class WorkspaceScoped(Protocol):
    """Any resource that belongs to a workspace."""

    workspace_id: uuid.UUID


class NotAuthorized(Exception):
    """Raised when a principal may not perform an action. Mapped to 403/404."""

    def __init__(self, message: str = "Not authorized", *, as_not_found: bool = True):
        super().__init__(message)
        self.as_not_found = as_not_found


@dataclass
class Grant:
    """An explicit per-resource permission (mirrors a row in ``permissions``)."""

    level: Action


def _role_satisfies(role: Role | None, required: Role) -> bool:
    return role is not None and _ROLE_RANK[role] >= _ROLE_RANK[required]


def authorize(
    principal: Principal,
    action: Action,
    resource: WorkspaceScoped,
    *,
    explicit_grant: Grant | None = None,
) -> bool:
    """Return True if ``principal`` may perform ``action`` on ``resource``.

    ``explicit_grant`` is the highest-precedence per-resource permission, if the
    caller has already loaded one from the ``permissions`` table.
    """
    if principal.is_org_admin:
        return True

    workspace_id = resource.workspace_id

    # Explicit per-resource grant (overrides/extends the workspace role).
    if explicit_grant is not None and _ROLE_RANK[_ACTION_MIN_ROLE[explicit_grant.level]] >= 0:
        if _action_rank(explicit_grant.level) >= _action_rank(action):
            return True

    # Workspace role default.
    required = _ACTION_MIN_ROLE[action]
    return _role_satisfies(principal.role_in(workspace_id), required)


def _action_rank(action: Action) -> int:
    return {Action.VIEW: 0, Action.EDIT: 1, Action.MANAGE: 2}[action]


def require(
    principal: Principal,
    action: Action,
    resource: WorkspaceScoped,
    *,
    explicit_grant: Grant | None = None,
) -> None:
    """Raise ``NotAuthorized`` unless the action is permitted."""
    if not authorize(principal, action, resource, explicit_grant=explicit_grant):
        # 404 to avoid leaking existence of resources the caller can't see.
        raise NotAuthorized(as_not_found=True)


def scoped(stmt: Select, workspace_column: ColumnElement, principal: Principal) -> Select:
    """Constrain a SELECT to the principal's workspaces.

    Org-admins are unconstrained. Everyone else is limited to workspaces they're
    a member of. Pass the model's ``workspace_id`` column (e.g. ``Dashboard.workspace_id``).
    """
    if principal.is_org_admin:
        return stmt
    if not principal.workspace_ids:
        # No memberships → match nothing.
        return stmt.where(workspace_column.in_([]))
    return stmt.where(workspace_column.in_(principal.workspace_ids))
