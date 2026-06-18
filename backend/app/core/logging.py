"""Structured logging with secret redaction.

A processor scrubs known secret field names and high-entropy-looking values from
every log event before it is emitted, so connection credentials never leak into
logs or persisted ``sync_runs.error_log`` payloads.
"""

from __future__ import annotations

import logging
import re

import structlog

# Field names that must never appear in cleartext in logs.
SECRET_KEYS = {
    "password",
    "api_token",
    "auth_token",
    "access_token",
    "token",
    "service_account_json",
    "secret",
    "client_secret",
    "master_key",
    "session_secret",
}

_REDACTED = "«redacted»"
# Heuristic: long base64/hex-ish strings are likely tokens/keys.
_HIGH_ENTROPY = re.compile(r"^[A-Za-z0-9+/=_\-]{32,}$")


def _redact_value(key: str, value: object) -> object:
    if isinstance(value, dict):
        return {k: _redact_value(k, v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return type(value)(_redact_value(key, v) for v in value)
    if key.lower() in SECRET_KEYS:
        return _REDACTED
    if isinstance(value, str) and _HIGH_ENTROPY.match(value):
        return _REDACTED
    return value


def redact_processor(_logger, _method, event_dict: dict) -> dict:
    return {k: _redact_value(k, v) for k, v in event_dict.items()}


def configure_logging(*, json_logs: bool = True, level: int = logging.INFO) -> None:
    processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        redact_processor,  # redaction runs before rendering
    ]
    processors.append(
        structlog.processors.JSONRenderer()
        if json_logs
        else structlog.dev.ConsoleRenderer()
    )
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(level),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None):
    return structlog.get_logger(name)
