"""CSV / Excel file upload — fully native (no external dependency).

The first end-to-end demo source: an analyst uploads a flat file, it lands in
object storage, and this extractor parses it into records. Heavy parsing deps
(pandas/openpyxl) are imported lazily so the API process stays lean.
"""

from __future__ import annotations

from collections.abc import Iterator

from app.connectors.base import (
    Category,
    ConnectorDefinition,
    ConnectorField,
    FieldType,
    Kind,
    Maturity,
)
from app.connectors.extractor import (
    BaseHttpExtractor,
    ConnectionTestResult,
    Record,
    StreamSchema,
    SyncState,
)
from app.connectors.registry import register


class CsvUploadExtractor(BaseHttpExtractor):
    """Reads an uploaded file referenced by ``object_uri`` from object storage."""

    def __init__(self, config: dict):
        super().__init__(config)
        self.object_uri = config["object_uri"]
        self.stream_name = config.get("stream_name", "rows")

    def _read_dataframe(self):
        import pandas as pd  # lazy

        from app.storage.object_store import open_object

        with open_object(self.object_uri) as fh:
            if self.object_uri.lower().endswith((".xlsx", ".xls")):
                return pd.read_excel(fh)
            return pd.read_csv(fh)

    def test_connection(self) -> ConnectionTestResult:
        from app.storage.object_store import object_exists

        ok = object_exists(self.object_uri)
        return ConnectionTestResult(
            ok=ok,
            message="File found" if ok else f"File not found: {self.object_uri}",
        )

    def discover_schema(self) -> list[StreamSchema]:
        df = self._read_dataframe()
        props = {col: {"type": _json_type(str(dtype))} for col, dtype in df.dtypes.items()}
        return [
            StreamSchema(
                name=self.stream_name,
                json_schema={"type": "object", "properties": props},
            )
        ]

    def read(
        self, streams: list[str] | None = None, state: SyncState | None = None
    ) -> Iterator[Record]:
        df = self._read_dataframe()
        for row in df.to_dict(orient="records"):
            # NaN → None for clean JSONB landing.
            clean = {k: (None if _is_nan(v) else v) for k, v in row.items()}
            yield Record(stream=self.stream_name, data=clean)


def _is_nan(v) -> bool:
    return isinstance(v, float) and v != v


def _json_type(pandas_dtype: str) -> str:
    if "int" in pandas_dtype:
        return "integer"
    if "float" in pandas_dtype:
        return "number"
    if "bool" in pandas_dtype:
        return "boolean"
    if "datetime" in pandas_dtype:
        return "string"
    return "string"


register(
    ConnectorDefinition(
        type="csv_upload",
        name="CSV / Excel Upload",
        kind=Kind.NATIVE,
        category=Category.FILE,
        maturity=Maturity.GA,
        icon="file-spreadsheet",
        subtitle="Upload a flat file",
        description="Upload a CSV or Excel file directly and turn it into a dataset.",
        supports_schema_discovery=True,
        fields=[
            ConnectorField(
                name="upload_id",
                label="Uploaded file",
                type=FieldType.FILE,
                help_text="Drag and drop a .csv, .xlsx, or .xls file.",
            ),
        ],
        extractor_factory=lambda config: CsvUploadExtractor(config),
    )
)
