"""Notebooks API: CRUD + cell execution."""

from __future__ import annotations

import datetime as dt
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import WorkspaceRef, authorize_or_404, get_principal, get_session
from app.compute import kernel_manager
from app.core.authorize import Action, Principal, scoped
from app.models.compute import CellType, Notebook, NotebookCell

router = APIRouter(prefix="/notebooks", tags=["notebooks"])

STARTER = (
    "# Welcome! Pick a dataset from the panel on the left to insert load_dataset(...).\n"
    "# Variables persist across cells, just like Jupyter.\n"
    'print("Notebook ready")'
)


class NotebookOut(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    updated_at: dt.datetime
    cell_count: int


class CellOut(BaseModel):
    id: uuid.UUID
    position: int
    cell_type: str
    source: str
    outputs: list
    execution_count: int | None


class NotebookDetail(NotebookOut):
    cells: list[CellOut]


class CreateNotebook(BaseModel):
    workspace_id: uuid.UUID
    name: str = "Untitled notebook"


class UpdateCell(BaseModel):
    source: str | None = None
    cell_type: str | None = None


def _cell_out(c: NotebookCell) -> CellOut:
    return CellOut(id=c.id, position=c.position, cell_type=c.cell_type.value,
                   source=c.source, outputs=c.outputs or [], execution_count=c.execution_count)


def _nb_out(nb: Notebook) -> NotebookOut:
    return NotebookOut(id=nb.id, workspace_id=nb.workspace_id, name=nb.name,
                       updated_at=nb.updated_at, cell_count=len(nb.cells))


@router.get("", response_model=list[NotebookOut])
def list_notebooks(
    workspace_id: uuid.UUID | None = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[NotebookOut]:
    stmt = scoped(select(Notebook), Notebook.workspace_id, principal)
    if workspace_id:
        stmt = stmt.where(Notebook.workspace_id == workspace_id)
    return [_nb_out(n) for n in session.scalars(stmt.order_by(Notebook.updated_at.desc())).all()]


@router.post("", response_model=NotebookDetail, status_code=status.HTTP_201_CREATED)
def create_notebook(
    payload: CreateNotebook,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> NotebookDetail:
    authorize_or_404(principal, Action.EDIT, WorkspaceRef(payload.workspace_id))
    nb = Notebook(workspace_id=payload.workspace_id, owner_id=principal.user_id, name=payload.name)
    session.add(nb)
    session.flush()
    session.add(NotebookCell(notebook_id=nb.id, position=0, cell_type=CellType.CODE, source=STARTER))
    session.flush()
    session.refresh(nb)
    return NotebookDetail(**_nb_out(nb).model_dump(), cells=[_cell_out(c) for c in nb.cells])


@router.get("/{notebook_id}", response_model=NotebookDetail)
def get_notebook(
    notebook_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> NotebookDetail:
    nb = session.get(Notebook, notebook_id)
    if nb is None:
        raise HTTPException(404, "Notebook not found")
    authorize_or_404(principal, Action.VIEW, nb)
    return NotebookDetail(**_nb_out(nb).model_dump(), cells=[_cell_out(c) for c in nb.cells])


@router.delete("/{notebook_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notebook(
    notebook_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> None:
    nb = session.get(Notebook, notebook_id)
    if nb is None:
        raise HTTPException(404, "Notebook not found")
    authorize_or_404(principal, Action.MANAGE, nb)
    kernel_manager.restart(str(nb.id))  # tear down its kernel
    session.delete(nb)


@router.post("/{notebook_id}/cells", response_model=CellOut, status_code=status.HTTP_201_CREATED)
def add_cell(
    notebook_id: uuid.UUID,
    cell_type: str = "code",
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> CellOut:
    nb = session.get(Notebook, notebook_id)
    if nb is None:
        raise HTTPException(404, "Notebook not found")
    authorize_or_404(principal, Action.EDIT, nb)
    cell = NotebookCell(notebook_id=nb.id, position=len(nb.cells), cell_type=CellType(cell_type), source="")
    session.add(cell)
    session.flush()
    return _cell_out(cell)


@router.patch("/{notebook_id}/cells/{cell_id}", response_model=CellOut)
def update_cell(
    notebook_id: uuid.UUID,
    cell_id: uuid.UUID,
    payload: UpdateCell,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> CellOut:
    nb = session.get(Notebook, notebook_id)
    if nb is None:
        raise HTTPException(404, "Notebook not found")
    authorize_or_404(principal, Action.EDIT, nb)
    cell = session.get(NotebookCell, cell_id)
    if cell is None or cell.notebook_id != nb.id:
        raise HTTPException(404, "Cell not found")
    if payload.source is not None:
        cell.source = payload.source
    if payload.cell_type is not None:
        cell.cell_type = CellType(payload.cell_type)
    return _cell_out(cell)


@router.delete("/{notebook_id}/cells/{cell_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cell(
    notebook_id: uuid.UUID,
    cell_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> None:
    nb = session.get(Notebook, notebook_id)
    if nb is None:
        raise HTTPException(404, "Notebook not found")
    authorize_or_404(principal, Action.EDIT, nb)
    cell = session.get(NotebookCell, cell_id)
    if cell and cell.notebook_id == nb.id:
        session.delete(cell)


@router.post("/{notebook_id}/cells/{cell_id}/run", response_model=CellOut)
def run_cell(
    notebook_id: uuid.UUID,
    cell_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> CellOut:
    nb = session.get(Notebook, notebook_id)
    if nb is None:
        raise HTTPException(404, "Notebook not found")
    authorize_or_404(principal, Action.EDIT, nb)
    target = session.get(NotebookCell, cell_id)
    if target is None or target.notebook_id != nb.id:
        raise HTTPException(404, "Cell not found")
    if target.cell_type == CellType.MARKDOWN:
        return _cell_out(target)  # markdown cells render, they don't execute

    # Persistent kernel: run just this cell; variables persist across cells.
    result = kernel_manager.run(str(nb.id), target.source, workspace_id=str(nb.workspace_id))

    outputs: list = []
    if result.get("stdout"):
        outputs.append({"type": "stdout", "text": result["stdout"]})
    outputs.extend(result.get("outputs", []))
    target.outputs = outputs
    target.execution_count = (target.execution_count or 0) + 1
    target.last_run_at = dt.datetime.now(dt.UTC)
    nb.last_active_at = dt.datetime.now(dt.UTC)
    return _cell_out(target)


@router.post("/{notebook_id}/restart", status_code=status.HTTP_204_NO_CONTENT)
def restart_kernel(
    notebook_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> None:
    nb = session.get(Notebook, notebook_id)
    if nb is None:
        raise HTTPException(404, "Notebook not found")
    authorize_or_404(principal, Action.EDIT, nb)
    kernel_manager.restart(str(nb.id))
