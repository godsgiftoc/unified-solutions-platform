"""Databricks (Lakehouse SQL) — config scaffold."""

from __future__ import annotations

from app.connectors.base import (
    Category,
    ConnectorDefinition,
    ConnectorField,
    FieldType,
    Kind,
    Maturity,
)
from app.connectors.registry import register

register(
    ConnectorDefinition(
        type="databricks",
        name="Databricks",
        kind=Kind.CONFIG,
        category=Category.WAREHOUSE,
        maturity=Maturity.BETA,
        icon="database",
        subtitle="Lakehouse SQL",
        description="Sync a table from a Databricks SQL warehouse.",
        fields=[
            ConnectorField(name="workspace_url", label="Workspace URL", type=FieldType.URL),
            ConnectorField(name="http_path", label="SQL warehouse HTTP path"),
            ConnectorField(
                name="access_token", label="Access token", type=FieldType.PASSWORD, secret=True
            ),
            ConnectorField(name="catalog_table", label="Catalog.schema.table"),
        ],
    )
)
