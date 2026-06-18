"""FastAPI application entrypoint."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    auth,
    charts,
    connections,
    connectors,
    dashboards,
    datasets,
    marketplace,
    notebooks,
    public,
    queries,
    workspaces,
)
from app.connectors import load_all
from app.core.config import settings
from app.core.logging import configure_logging, get_logger

logger = get_logger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(json_logs=settings.is_production)
    load_all()  # import connector source modules so the catalog is populated
    # Ensure the catalog's <schema>.<table> views exist (Unity Catalog-style namespace).
    try:
        from app.core.db import SessionLocal
        from app.services import dataset_service

        with SessionLocal() as session:
            dataset_service.backfill_schema_views(session)
    except Exception as exc:  # noqa: BLE001
        logger.warning("schema_backfill_failed", error=str(exc))
    logger.info("startup", env=settings.env)
    yield


app = FastAPI(
    title="Unified Solutions Platform",
    version="0.1.0",
    description="Connect any data source, shape it, build dashboards, share to stakeholders.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"
for module in (
    auth,
    workspaces,
    connectors,
    connections,
    datasets,
    queries,
    charts,
    dashboards,
    marketplace,
    notebooks,
    public,
):
    app.include_router(module.router, prefix=API_PREFIX)


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "service": "usp-api", "version": app.version}
