"""Connector registry contract tests (no DB required)."""

from __future__ import annotations

from app.connectors import all_definitions, get
from app.connectors.base import Kind

EXPECTED_TYPES = {
    "commcare", "csv_upload", "kobo", "odk", "dhis2",
    "surveycto", "gsheets", "gdrive", "databricks", "rest",
}


def test_catalog_is_complete():
    types = {d.type for d in all_definitions()}
    assert EXPECTED_TYPES <= types, f"missing: {EXPECTED_TYPES - types}"


def test_native_connectors_have_an_extractor_factory():
    for d in all_definitions():
        if d.kind == Kind.NATIVE:
            assert d.extractor_factory is not None, f"{d.type} is native but has no factory"


def test_config_connectors_have_no_factory():
    for d in all_definitions():
        if d.kind == Kind.CONFIG:
            assert d.extractor_factory is None


def test_secret_fields_are_flagged():
    # Every connector with a password/token field must mark it secret.
    dhis2 = get("dhis2")
    assert "password" in dhis2.secret_field_names
    rest = get("rest")
    assert "auth_token" in rest.secret_field_names


def test_unknown_connector_raises():
    import pytest

    with pytest.raises(KeyError):
        get("does-not-exist")
