from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.dependencies import parse_date, require_write_access, service_dep
from app.models import AvailableDatesResponse, SnapshotResponse
from app.services.snapshot_service import SnapshotService


router = APIRouter(tags=["snapshot"])


@router.get("/api/snapshot/today", response_model=SnapshotResponse)
def get_today_snapshot(service: SnapshotService = Depends(service_dep)) -> SnapshotResponse:
    """Return today's snapshot (auto-creates if missing)."""
    return SnapshotResponse(**service.get_today_snapshot())


@router.get("/api/snapshot/{snapshot_date}", response_model=SnapshotResponse)
def get_snapshot(
    snapshot_date: str,
    create_if_missing: bool = True,
    service: SnapshotService = Depends(service_dep),
) -> SnapshotResponse:
    """
    Return snapshot for a specific date.

    By default missing dates are auto-created from master people list so
    operators can work on any selected day without a manual bootstrap step.
    """
    parsed_date = parse_date(snapshot_date)
    return SnapshotResponse(
        **service.get_snapshot_for_date(parsed_date, create_if_missing=create_if_missing)
    )


@router.get("/api/history/dates", response_model=AvailableDatesResponse)
def get_available_dates(service: SnapshotService = Depends(service_dep)) -> AvailableDatesResponse:
    """Return all snapshot dates currently available in storage."""
    return AvailableDatesResponse(dates=service.list_available_dates())


@router.post("/api/snapshot/{snapshot_date}/save")
def save_snapshot_file(
    snapshot_date: str,
    _: None = Depends(require_write_access),
    service: SnapshotService = Depends(service_dep),
) -> dict:
    """Force-save snapshot file for selected date (explicit manual save action)."""
    parsed_date = parse_date(snapshot_date)
    return service.save_snapshot_for_date(parsed_date, create_if_missing=True)


@router.post("/api/history/{snapshot_date}/restore-to-today", response_model=SnapshotResponse)
def restore_history_to_today(
    snapshot_date: str,
    _: None = Depends(require_write_access),
    service: SnapshotService = Depends(service_dep),
) -> SnapshotResponse:
    """Restore one historical date into today's snapshot."""
    parsed_date = parse_date(snapshot_date)
    return SnapshotResponse(**service.restore_snapshot_to_today(parsed_date))


@router.delete("/api/snapshot/{snapshot_date}")
def delete_snapshot_file(
    snapshot_date: str,
    _: None = Depends(require_write_access),
    service: SnapshotService = Depends(service_dep),
) -> dict:
    """Delete one snapshot date file (and its tracking events file)."""
    parsed_date = parse_date(snapshot_date)
    return service.delete_snapshot_for_date(parsed_date)
