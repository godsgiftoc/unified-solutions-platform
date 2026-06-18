"""ODK Central (OData) — config scaffold."""

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
        type="odk",
        name="ODK Central",
        kind=Kind.CONFIG,
        category=Category.SURVEY,
        maturity=Maturity.BETA,
        icon="smartphone",
        subtitle="ODK Central OData",
        description="Sync form submissions from ODK Central via OData.",
        fields=[
            ConnectorField(name="base_url", label="Base URL", type=FieldType.URL),
            ConnectorField(name="project_id", label="Project ID"),
            ConnectorField(name="form_id", label="Form ID (xmlFormId)"),
            ConnectorField(name="email", label="Web-user email"),
            ConnectorField(name="password", label="Password", type=FieldType.PASSWORD, secret=True),
        ],
    )
)
