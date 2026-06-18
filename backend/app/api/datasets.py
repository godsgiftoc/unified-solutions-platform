"""Datasets API: list, inspect, preview, upload (CSV/Excel), and create from SQL."""

from __future__ import annotations

import datetime as dt
import io
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import WorkspaceRef, authorize_or_404, get_principal, get_session
from app.compute import engine
from app.core.authorize import Action, Principal, scoped
from app.models.compute import Dataset, DatasetVersion
from app.services import dataset_service as svc

router = APIRouter(prefix="/datasets", tags=["datasets"])


class DatasetOut(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    slug: str
    name: str
    kind: str
    catalog: str
    schema_name: str
    full_name: str
    row_count: int | None
    column_count: int
    created_at: dt.datetime


class ColumnOut(BaseModel):
    name: str
    type: str


class DatasetDetail(DatasetOut):
    columns: list[ColumnOut]


class CreateSqlDataset(BaseModel):
    workspace_id: uuid.UUID
    name: str
    sql: str


class FromRecords(BaseModel):
    workspace_id: uuid.UUID
    name: str
    columns: list[str]
    rows: list[list]
    source: str = "records"


def _version(session: Session, ds: Dataset) -> DatasetVersion | None:
    return session.get(DatasetVersion, ds.current_version_id) if ds.current_version_id else None


def _to_out(session: Session, ds: Dataset) -> DatasetOut:
    v = _version(session, ds)
    schema = svc.logical_schema(ds)
    return DatasetOut(
        id=ds.id,
        workspace_id=ds.workspace_id,
        slug=ds.slug,
        name=ds.name,
        kind=ds.kind.value,
        catalog=svc.CATALOG,
        schema_name=schema,
        full_name=f"{svc.CATALOG}.{schema}.{ds.slug}",
        row_count=v.row_count_estimate if v else None,
        column_count=len(v.schema) if v else 0,
        created_at=ds.created_at,
    )


@router.get("", response_model=list[DatasetOut])
def list_datasets(
    workspace_id: uuid.UUID | None = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[DatasetOut]:
    stmt = scoped(select(Dataset), Dataset.workspace_id, principal)
    if workspace_id:
        stmt = stmt.where(Dataset.workspace_id == workspace_id)
    rows = session.scalars(stmt.order_by(Dataset.created_at.desc())).all()
    return [_to_out(session, d) for d in rows]


@router.get("/{dataset_id}", response_model=DatasetDetail)
def get_dataset(
    dataset_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> DatasetDetail:
    ds = session.get(Dataset, dataset_id)
    if ds is None:
        raise HTTPException(404, "Dataset not found")
    authorize_or_404(principal, Action.VIEW, ds)
    base = _to_out(session, ds)
    v = _version(session, ds)
    return DatasetDetail(
        **base.model_dump(), columns=[ColumnOut(**c) for c in (v.schema if v else [])]
    )


@router.get("/{dataset_id}/preview")
def preview_dataset(
    dataset_id: uuid.UUID,
    limit: int = 50,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> dict:
    ds = session.get(Dataset, dataset_id)
    if ds is None:
        raise HTTPException(404, "Dataset not found")
    authorize_or_404(principal, Action.VIEW, ds)
    return engine.preview(svc.current_table(session, ds), limit=min(limit, 200))


@router.post("/upload", response_model=DatasetOut, status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    file: UploadFile = File(...),
    workspace_id: uuid.UUID = Form(...),
    name: str | None = Form(None),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> DatasetOut:
    import pandas as pd

    authorize_or_404(principal, Action.EDIT, WorkspaceRef(workspace_id))
    content = await file.read()
    fn = (file.filename or "upload.csv").lower()
    try:
        if fn.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content))
        else:
            df = pd.read_csv(io.BytesIO(content))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(422, f"Could not parse file: {exc}") from exc
    if df.empty:
        raise HTTPException(422, "File contains no rows.")

    ds = svc.create_raw_dataset_from_df(
        session,
        workspace_id=workspace_id,
        owner_id=principal.user_id,
        name=name or (file.filename or "Uploaded dataset").rsplit(".", 1)[0],
        df=df,
        source_ref={"upload": file.filename},
    )
    session.flush()
    return _to_out(session, ds)


@router.post("", response_model=DatasetOut, status_code=status.HTTP_201_CREATED)
def create_sql_dataset(
    payload: CreateSqlDataset,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> DatasetOut:
    authorize_or_404(principal, Action.EDIT, WorkspaceRef(payload.workspace_id))
    try:
        ds = svc.create_sql_dataset(
            session,
            workspace_id=payload.workspace_id,
            owner_id=principal.user_id,
            name=payload.name,
            sql=payload.sql,
        )
    except engine.QueryError as exc:
        raise HTTPException(422, str(exc)) from exc
    session.flush()
    return _to_out(session, ds)


@router.post("/from-records", response_model=DatasetOut, status_code=status.HTTP_201_CREATED)
def create_from_records(
    payload: FromRecords,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> DatasetOut:
    """Create a dataset from inline records — used by notebook save_dataset()."""
    import pandas as pd

    authorize_or_404(principal, Action.EDIT, WorkspaceRef(payload.workspace_id))
    df = pd.DataFrame(payload.rows, columns=payload.columns)
    if df.empty:
        raise HTTPException(422, "No rows to save.")
    ds = svc.create_raw_dataset_from_df(
        session,
        workspace_id=payload.workspace_id,
        owner_id=principal.user_id,
        name=payload.name,
        df=df,
        source_ref={"source": payload.source},
    )
    session.flush()
    return _to_out(session, ds)


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(
    dataset_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> None:
    ds = session.get(Dataset, dataset_id)
    if ds is None:
        raise HTTPException(404, "Dataset not found")
    authorize_or_404(principal, Action.MANAGE, ds)
    svc.delete_dataset(session, ds)
