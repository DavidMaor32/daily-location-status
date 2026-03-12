"""Export API routes for generating and downloading day/range snapshot workbooks.

Responsibility: expose HTTP endpoints for Excel export workflows consumed by the frontend.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.dependencies import build_download_response, parse_date, service_dep
from app.services.snapshot_service import SnapshotService


EXCEL_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
router = APIRouter(tags=["export"])


@router.get("/api/export/day/{snapshot_date}")
def export_snapshot_day(
    snapshot_date: str,
    service: SnapshotService = Depends(service_dep),
) -> StreamingResponse:
    """Download one day snapshot file in xlsx format."""
    parsed_date = parse_date(snapshot_date)
    filename, content = service.get_snapshot_excel_bytes(
        parsed_date,
        create_if_missing=(parsed_date == date.today()),
    )
    return build_download_response(content, filename, EXCEL_MEDIA_TYPE)


@router.get("/api/export/range")
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

