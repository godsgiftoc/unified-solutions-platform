"""DHIS2 (National HMIS) — config scaffold.

When the extractor lands it will pull the org-unit hierarchy, data elements and
periods as first-class dimension streams alongside aggregate/tracker values.
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
        type="dhis2",
        name="DHIS2",
        kind=Kind.CONFIG,
        category=Category.HMIS,
        maturity=Maturity.BETA,
        icon="bar-chart-3",
        subtitle="National HMIS",
        description="Sync aggregate or tracker data from a DHIS2 instance.",
        fields=[
            ConnectorField(name="base_url", label="Base URL", type=FieldType.URL),
            ConnectorField(name="username", label="Username"),
            ConnectorField(name="password", label="Password", type=FieldType.PASSWORD, secret=True),
            ConnectorField(name="org_unit", label="Org unit (UID)"),
            ConnectorField(name="dataset", label="Dataset / Program (UID)"),
        ],
    )
)
