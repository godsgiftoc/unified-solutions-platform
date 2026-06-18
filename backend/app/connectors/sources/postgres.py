"""PostgreSQL — native connector.

Connects to any reachable Postgres database and reads a table (or view). Uses
psycopg (already a platform dependency). test_connection runs a real `SELECT 1`.
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
    ConnectionTestResult,
    Record,
    StreamSchema,
    SyncState,
)
from app.connectors.registry import register


class PostgresExtractor:
    def __init__(self, config: dict):
        self.config = config
        self.table = (config.get("table") or "").strip()

    def _connect(self):
        import psycopg  # lazy

        return psycopg.connect(
            host=self.config["host"],
            port=int(self.config.get("port") or 5432),
            dbname=self.config["database"],
            user=self.config["username"],
            password=self.config.get("password", ""),
            sslmode=self.config.get("sslmode") or None,
            connect_timeout=10,
        )

    def test_connection(self) -> ConnectionTestResult:
        try:
            with self._connect() as conn, conn.cursor() as cur:
                cur.execute("SELECT version()")
                version = cur.fetchone()[0]
            return ConnectionTestResult(
                ok=True,
                message="Connected to PostgreSQL.",
                details={"server": version.split(",")[0]},
            )
        except Exception as exc:  # noqa: BLE001 - surface any driver error to the UI
            return ConnectionTestResult(ok=False, message=f"Connection failed: {exc}")

    def discover_schema(self) -> list[StreamSchema]:
        if not self.table:
            return []

        schema_name, _, tbl = self.table.rpartition(".")
        schema_name = schema_name or "public"
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_schema = %s AND table_name = %s
                ORDER BY ordinal_position
                """,
                (schema_name, tbl),
            )
            props = {name: {"type": _pg_to_json(dtype)} for name, dtype in cur.fetchall()}
        return [
            StreamSchema(name=tbl or "rows", json_schema={"type": "object", "properties": props})
        ]

    def read(
        self, streams: list[str] | None = None, state: SyncState | None = None
    ) -> Iterator[Record]:
        from psycopg import sql

        # Safe identifier quoting: table may be "schema.table".
        parts = [p for p in self.table.split(".") if p] or ["rows"]
        ident = sql.SQL(".").join(sql.Identifier(p) for p in parts)
        stream = parts[-1]
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(sql.SQL("SELECT * FROM {}").format(ident))
            cols = [c.name for c in cur.description]
            for row in cur:
                yield Record(stream=stream, data=dict(zip(cols, row, strict=False)))


def _pg_to_json(pg_type: str) -> str:
    t = pg_type.lower()
    if any(k in t for k in ("int", "serial")):
        return "integer"
    if any(k in t for k in ("numeric", "real", "double", "decimal")):
        return "number"
    if "bool" in t:
        return "boolean"
    return "string"


register(
    ConnectorDefinition(
        type="postgres",
        name="PostgreSQL",
        kind=Kind.NATIVE,
        category=Category.WAREHOUSE,
        maturity=Maturity.GA,
        icon="database",
        subtitle="Relational database",
        description="Connect to any PostgreSQL database and sync a table or view.",
        supports_schema_discovery=True,
        fields=[
            ConnectorField(name="host", label="Host", placeholder="db.example.org"),
            ConnectorField(
                name="port", label="Port", type=FieldType.NUMBER, required=False, placeholder="5432"
            ),
            ConnectorField(name="database", label="Database"),
            ConnectorField(name="username", label="Username"),
            ConnectorField(
                name="password",
                label="Password",
                type=FieldType.PASSWORD,
                secret=True,
                required=False,
            ),
            ConnectorField(
                name="table", label="Table (schema.table)", placeholder="public.my_table"
            ),
            ConnectorField(
                name="sslmode",
                label="SSL mode",
                type=FieldType.SELECT,
                required=False,
                options=["disable", "require", "verify-full"],
            ),
        ],
        extractor_factory=lambda config: PostgresExtractor(config),
    )
)
