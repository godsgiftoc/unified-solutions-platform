"""Create or reset a superadmin (org admin) account.

There is no public sign-up, so this bootstraps the first account that can then
provision everyone else from the in-app admin page.

    python -m app.scripts.create_superadmin <username> <password> [email]

Running it again for an existing username just resets that user's password and
ensures they are an active superadmin.
"""

from __future__ import annotations

import sys

from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models.platform import AuthProvider, User


def main() -> None:
    if len(sys.argv) < 3:
        print("usage: python -m app.scripts.create_superadmin <username> <password> [email]")
        raise SystemExit(1)
    username = sys.argv[1].strip()
    password = sys.argv[2]
    email = (sys.argv[3] if len(sys.argv) > 3 else f"{username}@users.local").strip().lower()

    with SessionLocal() as session:
        user = session.scalar(select(User).where(func.lower(User.username) == username.lower()))
        action = "updated"
        if user is None:
            user = User(username=username, email=email, auth_provider=AuthProvider.LOCAL)
            session.add(user)
            action = "created"
        user.password_hash = hash_password(password)
        user.is_org_admin = True
        user.is_active = True
        session.commit()
        print(f"✓ superadmin {action}: {username}")


if __name__ == "__main__":
    main()
