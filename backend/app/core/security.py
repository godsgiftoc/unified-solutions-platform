"""Session token signing.

P0 uses a signed cookie carrying the user id (opaque server-side sessions in
Redis land with the full OIDC flow in a later pass). The cookie is signed with
``USP_SESSION_SECRET`` so it can't be forged.
"""

from __future__ import annotations

from itsdangerous import BadSignature, URLSafeSerializer

from app.core.config import settings

SESSION_COOKIE = "usp_session"
_serializer = URLSafeSerializer(settings.session_secret, salt="usp-session")


def issue_session(user_id: str) -> str:
    return _serializer.dumps({"uid": user_id})


def read_session(token: str) -> str | None:
    try:
        data = _serializer.loads(token)
        return data.get("uid")
    except BadSignature:
        return None
