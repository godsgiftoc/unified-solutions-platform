"""SurveyCTO — config scaffold."""

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
        type="surveycto",
        name="SurveyCTO",
        kind=Kind.CONFIG,
        category=Category.SURVEY,
        maturity=Maturity.BETA,
        icon="clipboard-check",
        subtitle="SurveyCTO API",
        description="Sync form data from a SurveyCTO server.",
        fields=[
            ConnectorField(name="server_name", label="Server name"),
            ConnectorField(name="form_id", label="Form ID"),
            ConnectorField(name="username", label="Username (email)"),
            ConnectorField(name="password", label="Password",
                           type=FieldType.PASSWORD, secret=True),
        ],
    )
)
