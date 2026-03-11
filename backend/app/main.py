from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import date
from functools import lru_cache
from io import BytesIO

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from app.config import Settings
from app.exceptions import AppError, NotFoundError, StorageError, ValidationError
from app.models import (
    AvailableDatesResponse,
    LocationCreate,
    LocationListResponse,
    PersonCreate,
    PersonRecord,
    PersonUpdate,
    SnapshotResponse,
)
from app.services.snapshot_service import SnapshotService
from app.storage.providers import build_storage


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
EXCEL_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@lru_cache
def get_settings() -> Settings:
    """Load and cache environment settings once per process."""
    return Settings.from_env()


@lru_cache
def get_snapshot_service() -> SnapshotService:
    """Build and cache business service with selected storage backend."""
    settings = get_settings()
    storage = build_storage(settings)
    return SnapshotService(settings=settings, storage=storage)


def parse_date(value: str) -> date:
    """Parse YYYY-MM-DD date from path parameter."""
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Date must be in YYYY-MM-DD format") from exc


def service_dep() -> SnapshotService:
    """FastAPI dependency provider for snapshot service."""
    return get_snapshot_service()


def build_download_response(content: bytes, filename: str, media_type: str) -> StreamingResponse:
    """Build HTTP attachment response for file downloads."""
    response = StreamingResponse(BytesIO(content), media_type=media_type)
    response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Initialize today's snapshot during application startup."""
    service = get_snapshot_service()
    try:
        service.initialize_today_snapshot()
        logger.info("Today's snapshot initialized successfully")
    except Exception as exc:  # noqa: BLE001
        logger.exception("Startup initialization failed: %s", exc)
    yield


app = FastAPI(title="Daily Status Manager API", version="1.0.0", lifespan=lifespan)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(NotFoundError)
async def not_found_error_handler(_: object, exc: NotFoundError):
    """Return unified 404 response for not found business errors."""
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(ValidationError)
async def validation_error_handler(_: object, exc: ValidationError):
    """Return unified 400 response for validation/business errors."""
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(StorageError)
async def storage_error_handler(_: object, exc: StorageError):
    """Return unified 500 response for storage backend errors."""
    return JSONResponse(status_code=500, content={"detail": str(exc)})


@app.exception_handler(AppError)
async def app_error_handler(_: object, exc: AppError):
    """Return unified fallback response for known application errors."""
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.get("/api/health")
def health() -> dict:
    """Health-check endpoint used by monitoring and readiness checks."""
    return {"status": "ok"}


@app.get("/api/snapshot/today", response_model=SnapshotResponse)
def get_today_snapshot(service: SnapshotService = Depends(service_dep)) -> SnapshotResponse:
    """Return today's snapshot (auto-creates if missing)."""
    return SnapshotResponse(**service.get_today_snapshot())


@app.get("/api/snapshot/{snapshot_date}", response_model=SnapshotResponse)
def get_snapshot(snapshot_date: str, service: SnapshotService = Depends(service_dep)) -> SnapshotResponse:
    """Return snapshot for a specific date."""
    parsed_date = parse_date(snapshot_date)
    return SnapshotResponse(**service.get_snapshot_for_date(parsed_date, create_if_missing=False))


@app.get("/api/export/day/{snapshot_date}")
def export_snapshot_day(snapshot_date: str, service: SnapshotService = Depends(service_dep)) -> StreamingResponse:
    """Download one day snapshot file in xlsx format."""
    parsed_date = parse_date(snapshot_date)
    filename, content = service.get_snapshot_excel_bytes(
        parsed_date,
        create_if_missing=(parsed_date == date.today()),
    )
    return build_download_response(content, filename, EXCEL_MEDIA_TYPE)


@app.get("/api/export/range")
def export_snapshot_range(
    date_from: str,
    date_to: str,
    service: SnapshotService = Depends(service_dep),
) -> StreamingResponse:
    """Download zip of all daily snapshot xlsx files in selected date range."""
    parsed_from = parse_date(date_from)
    parsed_to = parse_date(date_to)
    filename, content = service.get_snapshots_zip_bytes(parsed_from, parsed_to)
    return build_download_response(content, filename, "application/zip")


@app.get("/api/history/dates", response_model=AvailableDatesResponse)
def get_available_dates(service: SnapshotService = Depends(service_dep)) -> AvailableDatesResponse:
    """Return all snapshot dates currently available in storage."""
    return AvailableDatesResponse(dates=service.list_available_dates())


@app.get("/api/locations", response_model=LocationListResponse)
def get_locations(service: SnapshotService = Depends(service_dep)) -> LocationListResponse:
    """Return all available location options."""
    return LocationListResponse(locations=service.get_locations())


@app.post("/api/locations", response_model=LocationListResponse)
def create_location(
    payload: LocationCreate,
    service: SnapshotService = Depends(service_dep),
) -> LocationListResponse:
    """Create location option and return updated location list."""
    return LocationListResponse(locations=service.add_location(payload.location))


@app.post("/api/people", response_model=PersonRecord)
def create_person(payload: PersonCreate, service: SnapshotService = Depends(service_dep)) -> PersonRecord:
    """Create a person in master list and insert into today's snapshot."""
    return PersonRecord(**service.add_person_today(payload))


@app.patch("/api/people/{person_id}", response_model=PersonRecord)
def quick_update_person(
    person_id: str,
    payload: PersonUpdate,
    service: SnapshotService = Depends(service_dep),
) -> PersonRecord:
    """Apply partial update (location/status/notes/name) to today's row."""
    return PersonRecord(**service.update_person_today(person_id, payload))


@app.put("/api/people/{person_id}", response_model=PersonRecord)
def replace_person(
    person_id: str,
    payload: PersonCreate,
    service: SnapshotService = Depends(service_dep),
) -> PersonRecord:
    """Replace editable fields for a person in today's snapshot."""
    return PersonRecord(**service.replace_person_today(person_id, payload))


@app.delete("/api/people/{person_id}", response_model=PersonRecord)
def delete_person(
    person_id: str,
    service: SnapshotService = Depends(service_dep),
) -> PersonRecord:
    """Delete a person from today's snapshot and master list."""
    return PersonRecord(**service.delete_person_today(person_id))


@app.post("/api/history/{snapshot_date}/restore-to-today", response_model=SnapshotResponse)
def restore_history_to_today(snapshot_date: str, service: SnapshotService = Depends(service_dep)) -> SnapshotResponse:
    """Restore one historical date into today's snapshot."""
    parsed_date = parse_date(snapshot_date)
    return SnapshotResponse(**service.restore_snapshot_to_today(parsed_date))
