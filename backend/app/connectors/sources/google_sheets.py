"""Google Sheets — config scaffold."""

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
        type="gsheets",
        name="Google Sheets",
        kind=Kind.CONFIG,
        category=Category.SPREADSHEET,
        maturity=Maturity.BETA,
        icon="sheet",
        subtitle="Spreadsheet sync",
        description="Sync a tab from a live Google Spreadsheet.",
        fields=[
            ConnectorField(name="spreadsheet_id", label="Spreadsheet ID"),
            ConnectorField(name="sheet_name", label="Sheet / tab name"),
            ConnectorField(
                name="service_account_json",
                label="Service-account JSON",
                type=FieldType.TEXTAREA,
                secret=True,
            ),
        ],
    )
)
