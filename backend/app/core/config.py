"""Application configuration, loaded from environment (12-factor) via pydantic-settings."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="USP_",
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    frontend_origin: str = "http://localhost:5173"
    # When true (dev only), unauthenticated API calls fall back to the dev@local
    # user. Default OFF so a real username+password login is required everywhere.
    dev_autologin: bool = False

    # Secrets / sessions
    master_key: str = Field(default="", description="Fernet KEK for envelope encryption")
    session_secret: str = "dev-insecure-session-secret"

    # Postgres
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "usp"
    postgres_password: str = "usp"
    postgres_db: str = "usp"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Object storage
    s3_endpoint: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "usp-data"
    s3_region: str = "us-east-1"

    # Google OIDC (optional)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_hosted_domain: str = ""

    # Notebook kernels / compute (scaling knobs)
    max_kernels: int = 64  # hard cap on concurrent kernel subprocesses (LRU-evicted)
    kernel_idle_timeout_s: int = 900  # reap a kernel idle longer than this (15 min)
    max_concurrent_runs: int = 32  # ceiling on cells executing at once (protects the threadpool)
    kernel_run_timeout_s: int = 600  # per-read idle backstop before a stuck kernel is killed
    request_threads: int = 128  # anyio threadpool size: sync endpoints + streaming runs + headroom

    # Database connection pool (per process; front with PgBouncer for many instances)
    db_pool_size: int = 20
    db_max_overflow: int = 30
    db_pool_timeout_s: int = 30
    db_pool_recycle_s: int = 1800

    # Rate limiting (login brute-force protection; per client IP)
    login_rate_limit: int = 10
    login_rate_window_s: int = 60

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def is_production(self) -> bool:
        return self.env.lower() in {"production", "prod"}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
