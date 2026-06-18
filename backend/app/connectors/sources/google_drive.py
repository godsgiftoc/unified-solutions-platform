"""Google Drive (service account) — config scaffold."""

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
        type="gdrive",
        name="Google Drive",
        kind=Kind.CONFIG,
        category=Category.SPREADSHEET,
        maturity=Maturity.BETA,
        icon="hard-drive",
        subtitle="Service account",
        description="Sync files from a Drive folder or shared drive.",
        fields=[
            ConnectorField(name="folder_id", label="Folder / Shared-Drive ID"),
            ConnectorField(name="file_filter", label="File type", type=FieldType.SELECT,
                           options=["Google Sheets", "CSV", "Excel"]),
            ConnectorField(name="service_account_json", label="Service-account JSON",
                           type=FieldType.TEXTAREA, secret=True),
        ],
    )
)
