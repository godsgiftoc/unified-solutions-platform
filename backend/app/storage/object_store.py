"""Object storage abstraction (MinIO/S3-compatible).

Used for raw + materialized Parquet, uploads, and notebook artifacts. Keeps the
rest of the app decoupled from the storage backend (MinIO on-prem ↔ S3 in prod).
``boto3`` is imported lazily so the API process doesn't need it until storage is
actually touched.

URIs are of the form ``s3://<bucket>/<key>``.
"""

from __future__ import annotations

import contextlib
from collections.abc import Iterator
from io import BytesIO
from urllib.parse import urlparse

from app.core.config import settings


def _client():
    import boto3  # lazy

    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
    )


def _split(uri: str) -> tuple[str, str]:
    parsed = urlparse(uri)
    if parsed.scheme != "s3":
        raise ValueError(f"Expected s3:// URI, got {uri!r}")
    return parsed.netloc, parsed.path.lstrip("/")


def build_uri(key: str, *, bucket: str | None = None) -> str:
    return f"s3://{bucket or settings.s3_bucket}/{key}"


def put_bytes(key: str, data: bytes, *, content_type: str | None = None) -> str:
    bucket = settings.s3_bucket
    extra = {"ContentType": content_type} if content_type else {}
    _client().put_object(Bucket=bucket, Key=key, Body=data, **extra)
    return build_uri(key, bucket=bucket)


def object_exists(uri: str) -> bool:
    bucket, key = _split(uri)
    try:
        _client().head_object(Bucket=bucket, Key=key)
        return True
    except Exception:
        return False


@contextlib.contextmanager
def open_object(uri: str) -> Iterator[BytesIO]:
    """Yield a file-like object for an s3:// URI."""
    bucket, key = _split(uri)
    obj = _client().get_object(Bucket=bucket, Key=key)
    yield BytesIO(obj["Body"].read())
