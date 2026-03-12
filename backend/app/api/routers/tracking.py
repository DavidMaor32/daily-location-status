"""Location tracking API routes for person events and computed transitions."""

from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import parse_date, service_dep
from app.models import (
    LocationEventCreate,
    LocationEventVoidReasonType,
    PersonLocationEventsResponse,
    PersonTransitionsResponse,
)
from app.services.snapshot_service import SnapshotService


router = APIRouter(tags=["tracking"])


@router.get("/api/people/{person_id}/location-events", response_model=PersonLocationEventsResponse)
def get_person_location_events(
    person_id: str,
    snapshot_date: Optional[str] = None,
    include_voided: bool = True,
    service: SnapshotService = Depends(service_dep),
) -> PersonLocationEventsResponse:
    """Return one person's location-events timeline for selected date (today by default)."""
    target_date = parse_date(snapshot_date) if snapshot_date else date.today()
    return PersonLocationEventsResponse(
        **service.get_person_location_events(
            person_id=person_id,
            snapshot_date=target_date,
            create_if_missing=True,
            include_voided=include_voided,
        )
    )


@router.get("/api/people/{person_id}/transitions", response_model=PersonTransitionsResponse)
def get_person_location_transitions(
    person_id: str,
    snapshot_date: Optional[str] = None,
    service: SnapshotService = Depends(service_dep),
) -> PersonTransitionsResponse:
    """Return one person's computed transitions for selected date (today by default)."""
    target_date = parse_date(snapshot_date) if snapshot_date else date.today()
    return PersonTransitionsResponse(
        **service.get_person_location_transitions(
            person_id=person_id,
            snapshot_date=target_date,
            create_if_missing=True,
        )
    )


@router.post(
    "/api/people/{person_id}/location-events",
    response_model=PersonLocationEventsResponse,
)
def create_person_location_event(
    person_id: str,
    payload: LocationEventCreate,
    service: SnapshotService = Depends(service_dep),
) -> PersonLocationEventsResponse:
    """Append one location event for today and return updated person timeline."""
    return PersonLocationEventsResponse(
        **service.add_location_event_today(
            person_id=person_id,
            location=payload.location,
            daily_status=payload.daily_status,
            occurred_at=payload.occurred_at,
            source="manual_ui",
        )
    )


@router.delete(
    "/api/people/{person_id}/location-events/{event_id}",
    response_model=PersonLocationEventsResponse,
)
def delete_person_location_event(
    person_id: str,
    event_id: str,
    reason: LocationEventVoidReasonType = Query(default="correction"),
    service: SnapshotService = Depends(service_dep),
) -> PersonLocationEventsResponse:
    """Hard-delete one location event from today's timeline and return updated person timeline."""
    return PersonLocationEventsResponse(
        **service.delete_location_event_today(
            person_id=person_id,
            event_id=event_id,
            reason=reason,
        )
    )
