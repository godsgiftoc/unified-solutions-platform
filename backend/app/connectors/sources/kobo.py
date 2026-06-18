"""Kobo Toolbox — config scaffold (extractor lands in P4)."""

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
        type="kobo",
        name="Kobo Toolbox",
        kind=Kind.CONFIG,
        category=Category.SURVEY,
        maturity=Maturity.BETA,
        icon="clipboard-list",
        subtitle="KoboToolbox API",
        description="Sync submissions from a KoboToolbox asset.",
        fields=[
            ConnectorField(
                name="server_url",
                label="Server URL",
                type=FieldType.URL,
                placeholder="https://kf.kobotoolbox.org",
            ),
            ConnectorField(name="asset_uid", label="Asset / Form UID"),
            ConnectorField(
                name="api_token", label="API token", type=FieldType.PASSWORD, secret=True
            ),
        ],
    )
)
