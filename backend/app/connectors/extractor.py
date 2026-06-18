"""Extractor protocol + shared base (see plan §4.2).

Every connector that supports sync implements ``Extractor``. The orchestrator
only ever touches this protocol — it knows nothing source-specific.
"""

from __future__ import annotations

import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential


@dataclass
class StreamSchema:
    name: str                                # logical entity, e.g. "form_submissions"
    json_schema: dict                        # inferred/declared JSON Schema of a record
    primary_key: list[str] | None = None
    cursor_field: str | None = None          # field used for incremental
    supports_incremental: bool = False


@dataclass
class Record:
    stream: str
    data: dict
    emitted_at: float = field(default_factory=time.time)
    primary_key_value: str | None = None


@dataclass
class SyncState:
    """Opaque per-stream incremental cursor checkpoint."""

    cursors: dict[str, Any] = field(default_factory=dict)


@dataclass
class ConnectionTestResult:
    ok: bool
    message: str
    details: dict | None = None


@runtime_checkable
class Extractor(Protocol):
    def __init__(self, config: dict): ...  # decrypted config; instantiated only in the worker

    def test_connection(self) -> ConnectionTestResult: ...

    def discover_schema(self) -> list[StreamSchema]: ...

    def read(
        self, streams: list[str] | None = None, state: SyncState | None = None
    ) -> Iterator[Record]: ...


class BaseHttpExtractor:
    """Shared plumbing: an httpx client + retry with exponential backoff."""

    def __init__(self, config: dict):
        self.config = config
        self.client = httpx.Client(timeout=60.0, follow_redirects=True)

    @retry(
        retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)),
        wait=wait_exponential(multiplier=1, max=60),
        stop=stop_after_attempt(5),
        reraise=True,
    )
    def _get(self, url: str, **kwargs) -> httpx.Response:
        resp = self.client.get(url, **kwargs)
        resp.raise_for_status()
        return resp

    # Sensible defaults so config-only connectors can subclass without boilerplate.
    def test_connection(self) -> ConnectionTestResult:  # pragma: no cover - overridden
        raise NotImplementedError

    def discover_schema(self) -> list[StreamSchema]:
        return []

    def read(
        self, streams: list[str] | None = None, state: SyncState | None = None
    ) -> Iterator[Record]:  # pragma: no cover - overridden
        raise NotImplementedError
        yield  # pragma: no cover

    def close(self) -> None:
        self.client.close()
