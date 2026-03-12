"""People API routes for CRUD operations and self-report updates."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.dependencies import service_dep
from app.models import (
    InitialPeopleListCreate,
    InitialPeopleListResponse,
    PersonCreate,
    PersonRecord,
    PersonUpdate,
    SelfReportUpdate,
)
from app.services.snapshot_service import SnapshotService


router = APIRouter(tags=["people"])


@router.post("/api/people", response_model=PersonRecord)
def create_person(payload: PersonCreate, service: SnapshotService = Depends(service_dep)) -> PersonRecord:
    """Create a person in master list and insert into today's snapshot."""
    return PersonRecord(**service.add_person_today(payload))


@router.post("/api/people/initialize-list", response_model=InitialPeopleListResponse)
def create_initial_people_list(
    payload: InitialPeopleListCreate,
    service: SnapshotService = Depends(service_dep),
) -> InitialPeopleListResponse:
    """Bulk-create initial names in master list and today's snapshot."""
    return InitialPeopleListResponse(**service.add_initial_people_today(payload.names))


@router.patch("/api/people/{person_id}", response_model=PersonRecord)
def quick_update_person(
    person_id: str,
    payload: PersonUpdate,
    service: SnapshotService = Depends(service_dep),
) -> PersonRecord:
    """Apply partial update to today's row."""
    return PersonRecord(**service.update_person_today(person_id, payload))


@router.post("/api/self-report", response_model=PersonRecord)
def create_self_report(
    payload: SelfReportUpdate,
    service: SnapshotService = Depends(service_dep),
) -> PersonRecord:
    """Update today's self-reported location and status."""
    return PersonRecord(
        **service.update_self_report_today(
            person_lookup=payload.person_lookup,
            self_location=payload.self_location,
            self_daily_status=payload.self_daily_status,
            source="self_report_api",
        )
    )


@router.put("/api/people/{person_id}", response_model=PersonRecord)
def replace_person(
    person_id: str,
    payload: PersonCreate,
    service: SnapshotService = Depends(service_dep),
) -> PersonRecord:
    """Replace editable fields for a person in today's snapshot."""
    return PersonRecord(**service.replace_person_today(person_id, payload))


@router.delete("/api/people/{person_id}", response_model=PersonRecord)
def delete_person(
    person_id: str,
    service: SnapshotService = Depends(service_dep),
) -> PersonRecord:
    """Delete a person from today's snapshot and master list."""
    return PersonRecord(**service.delete_person_today(person_id))
