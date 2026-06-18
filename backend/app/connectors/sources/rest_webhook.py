"""REST / Webhook (any generic JSON API) — config scaffold.

This is one of the universal escape hatches that makes "every connection" true:
any JSON HTTP API can be pulled by pointing ``json_path`` at the records array.
"""

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
        type="rest",
        name="REST / Webhook",
        kind=Kind.CONFIG,
        category=Category.GENERIC,
        maturity=Maturity.BETA,
        icon="code",
        subtitle="Generic API",
        description="Pull records from any JSON HTTP API via a JSON path.",
        fields=[
            ConnectorField(name="endpoint_url", label="Endpoint URL", type=FieldType.URL),
            ConnectorField(name="auth_header", label="Auth header name", required=False,
                           placeholder="Authorization"),
            ConnectorField(name="auth_token", label="Token / API key",
                           type=FieldType.PASSWORD, secret=True, required=False),
            ConnectorField(name="json_path", label="JSON path to records",
                           placeholder="$.data.results[*]"),
        ],
    )
)
