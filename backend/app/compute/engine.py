"""DuckDB analytical engine.

The query substrate for datasets, the SQL editor, charts, and notebooks. Datasets
land as DuckDB tables (``ds_<uuid>``); user SQL is parsed with sqlglot and only
single read-only SELECT/WITH/UNION statements are allowed to execute.

Dev note: this uses one embedded DuckDB file. In production the plan calls for a
read-only DB role + per-workspace isolation; the sqlglot guard is the primary
write/DDL protection here.
"""

from __future__ import annotations

import datetime as dt
import decimal
import threading
import uuid
from pathlib import Path
from typing import Any

import duckdb
import sqlglot
from sqlglot import exp

_DATA_DIR = Path(__file__).resolve().parents[2] / ".data"
_DATA_DIR.mkdir(exist_ok=True)
_DB_PATH = str(_DATA_DIR / "usp.duckdb")

_lock = threading.Lock()
_db: duckdb.DuckDBPyConnection | None = None

MAX_ROWS = 5000

_FORBIDDEN = (
    exp.Insert,
    exp.Update,
    exp.Delete,
    exp.Create,
    exp.Drop,
    exp.Alter,
    exp.Command,
    exp.Copy,
    exp.Set,
)


class QueryError(Exception):
    """Raised for invalid or non-read-only SQL."""


def _connection() -> duckdb.DuckDBPyConnection:
    global _db
    if _db is None:
        _db = duckdb.connect(_DB_PATH)
    return _db.cursor()  # cursor() is a lightweight, thread-safe child connection


def table_name(dataset_id: uuid.UUID) -> str:
    return f"ds_{dataset_id.hex}"


def assert_read_only(sql: str) -> None:
    try:
        statements = [s for s in sqlglot.parse(sql, read="duckdb") if s is not None]
    except Exception as exc:  # noqa: BLE001
        raise QueryError(f"Could not parse SQL: {exc}") from exc
    if len(statements) != 1:
        raise QueryError("Exactly one statement is allowed.")
    stmt = statements[0]
    if any(isinstance(node, _FORBIDDEN) for node in stmt.walk()):
        raise QueryError("Only read-only SELECT queries are allowed.")
    if not isinstance(stmt, (exp.Select, exp.Union, exp.Subquery)):
        raise QueryError("Query must be a SELECT statement.")


def _sanitize(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, decimal.Decimal):
        return float(value)
    if isinstance(value, (dt.date, dt.datetime, dt.time)):
        return value.isoformat()
    if isinstance(value, (bytes, bytearray, memoryview)):
        return "<binary>"
    return str(value)


def run_select(sql: str, limit: int = MAX_ROWS) -> dict:
    """Validate + execute a read-only query. Returns columns, rows, and metadata."""
    assert_read_only(sql)
    capped = min(limit, MAX_ROWS)
    wrapped = f"SELECT * FROM ({sql.rstrip(';')}) AS _q LIMIT {capped + 1}"
    with _lock:
        cur = _connection()
        result = cur.execute(wrapped)
        columns = [d[0] for d in result.description]
        fetched = result.fetchall()
    truncated = len(fetched) > capped
    rows = [[_sanitize(v) for v in row] for row in fetched[:capped]]
    return {"columns": columns, "rows": rows, "row_count": len(rows), "truncated": truncated}


def register_dataframe(table: str, df) -> dict:
    """Create-or-replace a DuckDB table from a pandas DataFrame. Returns its schema."""
    with _lock:
        cur = _connection()
        cur.register("_incoming_df", df)
        cur.execute(f'CREATE OR REPLACE TABLE "{table}" AS SELECT * FROM _incoming_df')
        cur.unregister("_incoming_df")
    return {"schema": schema(table), "row_count": count(table)}


def materialize_select(table: str, sql: str) -> dict:
    """Materialize a read-only query into a DuckDB table (for SQL datasets)."""
    assert_read_only(sql)
    with _lock:
        cur = _connection()
        cur.execute(f'CREATE OR REPLACE TABLE "{table}" AS SELECT * FROM ({sql.rstrip(";")}) AS _q')
    return {"schema": schema(table), "row_count": count(table)}


def schema(table: str) -> list[dict]:
    with _lock:
        cur = _connection()
        rows = cur.execute(f'DESCRIBE "{table}"').fetchall()
    return [{"name": r[0], "type": r[1]} for r in rows]


def count(table: str) -> int:
    with _lock:
        cur = _connection()
        return cur.execute(f'SELECT count(*) FROM "{table}"').fetchone()[0]


def preview(table: str, limit: int = 50) -> dict:
    return run_select(f'SELECT * FROM "{table}"', limit=limit)


def create_view(view: str, table: str) -> None:
    """Friendly alias (the dataset slug) over the physical ds_<uuid> table, so
    users can write `SELECT * FROM my_dataset` in the SQL editor."""
    with _lock:
        cur = _connection()
        cur.execute(f'CREATE OR REPLACE VIEW "{view}" AS SELECT * FROM "{table}"')


def drop_view(view: str) -> None:
    with _lock:
        cur = _connection()
        cur.execute(f'DROP VIEW IF EXISTS "{view}"')


def create_schema_view(schema: str, view: str, table: str) -> None:
    """Unity-Catalog-style namespace: expose the table as <schema>.<view> so
    users can query e.g. `SELECT * FROM uploads.my_table`."""
    with _lock:
        cur = _connection()
        cur.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')
        cur.execute(f'CREATE OR REPLACE VIEW "{schema}"."{view}" AS SELECT * FROM "{table}"')


def drop_schema_view(schema: str, view: str) -> None:
    with _lock:
        cur = _connection()
        cur.execute(f'DROP VIEW IF EXISTS "{schema}"."{view}"')


def drop_table(table: str) -> None:
    with _lock:
        cur = _connection()
        cur.execute(f'DROP TABLE IF EXISTS "{table}"')


def load_dataframe(table: str):
    """Return a DuckDB table as a pandas DataFrame (used by the notebook bridge)."""
    with _lock:
        cur = _connection()
        return cur.execute(f'SELECT * FROM "{table}"').fetch_df()
