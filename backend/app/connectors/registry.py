"""Connector registry with auto-discovery.

Each source module under ``app.connectors.sources`` calls ``register(defn)`` at
import time. ``load_all()`` walks the package and imports every module, so a new
connector file is picked up with zero wiring.
"""

from __future__ import annotations

import importlib
import pkgutil

from app.connectors.base import ConnectorDefinition

_REGISTRY: dict[str, ConnectorDefinition] = {}
_loaded = False


def register(defn: ConnectorDefinition) -> ConnectorDefinition:
    if defn.type in _REGISTRY:
        raise ValueError(f"Duplicate connector type: {defn.type!r}")
    if defn.kind.value == "native" and defn.extractor_factory is None:
        raise ValueError(f"native connector {defn.type!r} must provide an extractor_factory")
    _REGISTRY[defn.type] = defn
    return defn


def load_all() -> None:
    """Import every source module so registrations run (idempotent)."""
    global _loaded
    if _loaded:
        return
    from app.connectors import sources

    for mod in pkgutil.iter_modules(sources.__path__):
        if not mod.name.startswith("_"):
            importlib.import_module(f"{sources.__name__}.{mod.name}")
    _loaded = True


def get(connector_type: str) -> ConnectorDefinition:
    load_all()
    try:
        return _REGISTRY[connector_type]
    except KeyError:
        raise KeyError(f"Unknown connector type: {connector_type!r}") from None


def all_definitions() -> list[ConnectorDefinition]:
    load_all()
    return sorted(_REGISTRY.values(), key=lambda d: d.name.lower())
