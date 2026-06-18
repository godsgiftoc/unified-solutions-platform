"""Connection lifecycle: validation, slugging, and secret encryption.

Keeps the router thin and is the single place secrets are encrypted/decrypted,
so the "secrets never leave the boundary" invariant is easy to audit.
"""

from __future__ import annotations

import re
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.connectors import get
from app.connectors.base import ConnectorDefinition
from app.core.crypto import SECRET_SENTINEL, get_secret_box
from app.models.ingestion import Connection, ConnectionSecret, ConnectionStatus, SyncMode

_slug_re = re.compile(r"[^a-z0-9]+")


def slugify(name: str) -> str:
    base = _slug_re.sub("-", name.lower()).strip("-") or "connection"
    return base


def unique_slug(session: Session, name: str) -> str:
    base = slugify(name)
    slug = base
    n = 1
    while session.scalar(select(Connection.id).where(Connection.slug == slug)) is not None:
        n += 1
        slug = f"{base}-{n}"
    return slug


class ValidationError(Exception):
    pass


def _split_fields(defn: ConnectorDefinition, config: dict, secrets: dict) -> tuple[dict, dict]:
    """Validate provided keys against the connector schema; return (config, secrets)."""
    known = {f.name: f for f in defn.fields}
    secret_names = defn.secret_field_names

    clean_config: dict = {}
    for key, value in config.items():
        if key not in known:
            raise ValidationError(f"Unknown field {key!r} for connector {defn.type!r}")
        if key in secret_names:
            raise ValidationError(f"Field {key!r} is a secret; send it in 'secrets'")
        clean_config[key] = value

    clean_secrets: dict = {}
    for key, value in secrets.items():
        if key not in secret_names:
            raise ValidationError(f"{key!r} is not a secret field for {defn.type!r}")
        clean_secrets[key] = value

    # Required-field check (only on create paths; callers pass merged dicts).
    return clean_config, clean_secrets


def encrypt_secrets(secrets: dict[str, str]) -> tuple[bytes, dict[str, str]]:
    box = get_secret_box()
    return box.encrypt_fields(secrets)


def create_connection(
    session: Session,
    *,
    connector_type: str,
    name: str,
    workspace_id: uuid.UUID,
    owner_id: uuid.UUID | None,
    config: dict,
    secrets: dict[str, str],
    schedule_cron: str | None,
    sync_mode: str,
) -> Connection:
    defn = get(connector_type)  # raises KeyError on unknown type
    clean_config, clean_secrets = _split_fields(defn, config, secrets)

    conn = Connection(
        type=connector_type,
        name=name,
        slug=unique_slug(session, name),
        workspace_id=workspace_id,
        owner_id=owner_id,
        config=clean_config,
        status=ConnectionStatus.ACTIVE,
        schedule_cron=schedule_cron,
        sync_mode=SyncMode(sync_mode),
    )
    session.add(conn)
    session.flush()  # assign id

    if clean_secrets:
        wrapped, ciphertext = encrypt_secrets(clean_secrets)
        session.add(ConnectionSecret(connection_id=conn.id, wrapped_dek=wrapped, fields=ciphertext))
    return conn


def apply_update(
    session: Session,
    conn: Connection,
    *,
    name: str | None,
    config: dict | None,
    secrets: dict[str, str] | None,
    schedule_cron: str | None,
    sync_mode: str | None,
    status: str | None,
) -> Connection:
    defn = get(conn.type)
    if name is not None:
        conn.name = name
    if schedule_cron is not None:
        conn.schedule_cron = schedule_cron or None
    if sync_mode is not None:
        conn.sync_mode = SyncMode(sync_mode)
    if status is not None:
        conn.status = ConnectionStatus(status)
    if config is not None:
        clean_config, _ = _split_fields(defn, config, {})
        conn.config = {**conn.config, **clean_config}

    if secrets:
        # Drop sentinel values (= unchanged); only re-encrypt provided ones.
        changed = {k: v for k, v in secrets.items() if v != SECRET_SENTINEL}
        _, clean_secrets = _split_fields(defn, {}, changed)
        if clean_secrets:
            existing = conn.secret
            box = get_secret_box()
            if existing is None:
                wrapped, ciphertext = box.encrypt_fields(clean_secrets)
                conn.secret = ConnectionSecret(
                    connection_id=conn.id, wrapped_dek=wrapped, fields=ciphertext
                )
            else:
                # Re-encrypt the merged set under the existing DEK.
                current = box.decrypt_fields(existing.wrapped_dek, existing.fields)
                current.update(clean_secrets)
                wrapped, ciphertext = box.encrypt_fields(current)
                existing.wrapped_dek = wrapped
                existing.fields = ciphertext
    return conn


def decrypt_config(conn: Connection) -> dict:
    """Full decrypted config (non-secret + secret) for the worker at run time."""
    full = dict(conn.config)
    if conn.secret is not None:
        box = get_secret_box()
        full.update(box.decrypt_fields(conn.secret.wrapped_dek, conn.secret.fields))
    return full


def masked_secret_fields(conn: Connection) -> dict[str, bool]:
    """{field_name: has_value} — never the values themselves."""
    defn = get(conn.type)
    stored = set(conn.secret.fields.keys()) if conn.secret else set()
    return {name: name in stored for name in defn.secret_field_names}
