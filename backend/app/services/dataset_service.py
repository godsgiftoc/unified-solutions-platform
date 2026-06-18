"""Dataset lifecycle: turn dataframes / SQL into governed, queryable datasets."""

from __future__ import annotations

import datetime as dt
import re
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.compute import engine
from app.models.compute import (
    BuildStatus,
    Dataset,
    DatasetKind,
    DatasetVersion,
    Materialization,
)

_slug_re = re.compile(r"[^a-z0-9]+")


def slugify(name: str) -> str:
    return _slug_re.sub("_", name.lower()).strip("_") or "dataset"


CATALOG = "main"


def logical_schema(dataset: Dataset) -> str:
    """Unity-Catalog-style schema (database) grouping for a dataset."""
    if dataset.kind == DatasetKind.SQL:
        return "models"
    if dataset.kind == DatasetKind.NOTEBOOK:
        return "notebooks"
    src = dataset.source_ref or {}
    if src.get("upload"):
        return "uploads"
    if src.get("source") == "notebook":
        return "notebooks"
    return "raw"


def unique_slug(session: Session, workspace_id: uuid.UUID, name: str) -> str:
    base = slugify(name)
    slug = base
    n = 1
    while session.scalar(
        select(Dataset.id).where(Dataset.workspace_id == workspace_id, Dataset.slug == slug)
    ):
        n += 1
        slug = f"{base}_{n}"
    return slug


def _finalize(
    session: Session,
    dataset: Dataset,
    *,
    definition: dict,
    materialize,
) -> Dataset:
    """Create the dataset's first version and run the materialization callback."""
    session.add(dataset)
    session.flush()  # assign dataset.id

    table = engine.table_name(dataset.id)
    info = materialize(table)  # {"schema": [...], "row_count": int}

    version = DatasetVersion(
        dataset_id=dataset.id,
        version_no=1,
        definition=definition,
        physical_uri=table,
        schema=info["schema"],
        materialization=Materialization.MATERIALIZED,
        row_count_estimate=info["row_count"],
        build_status=BuildStatus.READY,
        built_at=dt.datetime.now(dt.UTC),
        built_by=dataset.owner_id,
    )
    session.add(version)
    session.flush()
    dataset.current_version_id = version.id
    # Friendly query alias (slug) + Unity-Catalog-style schema.table namespace.
    engine.create_view(dataset.slug, table)
    engine.create_schema_view(logical_schema(dataset), dataset.slug, table)
    return dataset


def create_raw_dataset_from_df(
    session: Session,
    *,
    workspace_id: uuid.UUID,
    owner_id: uuid.UUID | None,
    name: str,
    df,
    source_ref: dict | None = None,
) -> Dataset:
    dataset = Dataset(
        workspace_id=workspace_id,
        slug=unique_slug(session, workspace_id, name),
        name=name,
        kind=DatasetKind.RAW,
        owner_id=owner_id,
        source_ref=source_ref or {},
    )
    return _finalize(
        session,
        dataset,
        definition={"source": "upload"},
        materialize=lambda table: engine.register_dataframe(table, df),
    )


def create_sql_dataset(
    session: Session,
    *,
    workspace_id: uuid.UUID,
    owner_id: uuid.UUID | None,
    name: str,
    sql: str,
) -> Dataset:
    dataset = Dataset(
        workspace_id=workspace_id,
        slug=unique_slug(session, workspace_id, name),
        name=name,
        kind=DatasetKind.SQL,
        owner_id=owner_id,
        source_ref={"sql": sql},
    )
    return _finalize(
        session,
        dataset,
        definition={"sql": sql},
        materialize=lambda table: engine.materialize_select(table, sql),
    )


def current_table(session: Session, dataset: Dataset) -> str:
    version = session.get(DatasetVersion, dataset.current_version_id)
    return version.physical_uri if version else engine.table_name(dataset.id)


def dataset_schema(session: Session, dataset: Dataset) -> list[dict]:
    version = session.get(DatasetVersion, dataset.current_version_id)
    return version.schema if version else []


def backfill_schema_views(session: Session) -> int:
    """Ensure every dataset has its <schema>.<slug> view (run at startup)."""
    n = 0
    for ds in session.scalars(select(Dataset)).all():
        version = session.get(DatasetVersion, ds.current_version_id) if ds.current_version_id else None
        if not version or not version.physical_uri:
            continue
        try:
            engine.create_schema_view(logical_schema(ds), ds.slug, version.physical_uri)
            n += 1
        except Exception:  # noqa: BLE001 - never block startup
            pass
    return n


def delete_dataset(session: Session, dataset: Dataset) -> None:
    engine.drop_schema_view(logical_schema(dataset), dataset.slug)
    engine.drop_view(dataset.slug)
    engine.drop_table(engine.table_name(dataset.id))
    session.delete(dataset)
