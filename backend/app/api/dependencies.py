"""Shared FastAPI dependencies and request helper utilities for API routers."""

from __future__ import annotations

from datetime import date
from functools import lru_cache
from io import BytesIO

from fastapi import HTTPException
from fastapi.responses import StreamingResponse

from app.config import Settings
from app.services.snapshot_service import SnapshotService
from app.storage.providers import build_storage


@lru_cache
def get_settings() -> Settings:
    """Load and cache YAML settings once per process."""
    return Settings.from_yaml()


@lru_cache
def get_snapshot_service() -> SnapshotService:
    """Build and cache business service with selected storage backend."""
    settings = get_settings()
    storage = build_storage(settings)
    return SnapshotService(settings=settings, storage=storage)


def service_dep() -> SnapshotService:
    """FastAPI dependency provider for snapshot service."""
    return get_snapshot_service()


def parse_date(value: str) -> date:
    """Parse YYYY-MM-DD date from path/query parameters."""
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Date must be in YYYY-MM-DD format") from exc


def build_download_response(content: bytes, filename: str, media_type: str) -> StreamingResponse:
    """Build HTTP attachment response for file downloads."""
    response = StreamingResponse(BytesIO(content), media_type=media_type)
    response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
