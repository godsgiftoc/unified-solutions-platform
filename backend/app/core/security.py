"""Session token signing.

P0 uses a signed cookie carrying the user id (opaque server-side sessions in
Redis land with the full OIDC flow in a later pass). The cookie is signed with
``USP_SESSION_SECRET`` so it can't be forged.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets

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


# --- Password hashing (PBKDF2-HMAC-SHA256, stdlib; Django-style encoding) ---
# PBKDF2 is NIST-approved and dependency-free. Stored as
# ``pbkdf2_sha256$<rounds>$<salt_b64>$<hash_b64>`` so the params travel with the
# hash and we can raise the cost later without breaking existing passwords.
_PBKDF2_ROUNDS = 320_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${_PBKDF2_ROUNDS}${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        algo, rounds, salt_b64, hash_b64 = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), base64.b64decode(salt_b64), int(rounds)
        )
        return hmac.compare_digest(dk, base64.b64decode(hash_b64))
    except (ValueError, TypeError):
        return False
