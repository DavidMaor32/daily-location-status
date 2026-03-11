from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.dependencies import require_write_access, service_dep
from app.models import LocationCreate, LocationListResponse
from app.services.snapshot_service import SnapshotService


router = APIRouter(tags=["locations"])


@router.get("/api/locations", response_model=LocationListResponse)
def get_locations(service: SnapshotService = Depends(service_dep)) -> LocationListResponse:
    """Return all available location options."""
    return LocationListResponse(locations=service.get_locations())


@router.post("/api/locations", response_model=LocationListResponse)
def create_location(
    payload: LocationCreate,
    _: None = Depends(require_write_access),
    service: SnapshotService = Depends(service_dep),
) -> LocationListResponse:
    """Create location option and return updated location list."""
    return LocationListResponse(locations=service.add_location(payload.location))


@router.delete("/api/locations/{location_name}", response_model=LocationListResponse)
def remove_location(
    location_name: str,
    _: None = Depends(require_write_access),
    service: SnapshotService = Depends(service_dep),
) -> LocationListResponse:
    """Delete one location option and return updated location list."""
    return LocationListResponse(locations=service.delete_location(location_name))
