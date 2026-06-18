"""Seed a dev org-admin user and a default workspace.

Run with: ``python -m app.scripts.seed`` (or ``make seed``).
Idempotent — safe to run repeatedly.
"""

from __future__ import annotations

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.authorize import Role
from app.models.platform import AuthProvider, Membership, User, Workspace

DEV_EMAIL = "dev@local"
DEV_WORKSPACE_SLUG = "default"


def main() -> None:
    session = SessionLocal()
    try:
        user = session.scalar(select(User).where(User.email == DEV_EMAIL))
        if user is None:
            user = User(
                email=DEV_EMAIL,
                full_name="Dev Admin",
                auth_provider=AuthProvider.LOCAL,
                is_org_admin=True,
                is_active=True,
            )
            session.add(user)
            session.flush()
            print(f"created user {DEV_EMAIL}")

        ws = session.scalar(select(Workspace).where(Workspace.slug == DEV_WORKSPACE_SLUG))
        if ws is None:
            ws = Workspace(
                slug=DEV_WORKSPACE_SLUG,
                name="Default Workspace",
                description="Seeded dev workspace",
                created_by=user.id,
            )
            session.add(ws)
            session.flush()
            print("created workspace 'default'")

        if session.scalar(
            select(Membership).where(
                Membership.user_id == user.id, Membership.workspace_id == ws.id
            )
        ) is None:
            session.add(
                Membership(user_id=user.id, workspace_id=ws.id, role=Role.WORKSPACE_ADMIN)
            )
            print("added membership (workspace_admin)")

        session.commit()
        print(f"seed complete — user={user.id} workspace={ws.id}")
    finally:
        session.close()


if __name__ == "__main__":
    main()
