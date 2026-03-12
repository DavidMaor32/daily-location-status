"""Pydantic models for request/response payloads."""

from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


DailyStatusType = Literal["תקין", "לא תקין", "לא הוזן"]
SelfReportStatusType = Literal["תקין", "לא תקין"]
LocationEventType = Literal["move", "correction", "undo"]
LocationEventVoidReasonType = Literal["correction", "undo"]
LOCATION_MAX_LENGTH = 80


class PersonBase(BaseModel):
    """Shared fields for create/update person operations."""

    full_name: str = Field(..., min_length=2, max_length=120)
    location: str = Field(default="בבית", min_length=1, max_length=LOCATION_MAX_LENGTH)
    daily_status: DailyStatusType = "לא הוזן"
    notes: str = Field(default="", max_length=500)

    @field_validator("full_name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        """Trim and validate non-empty person name."""
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("full_name cannot be empty")
        return cleaned

    @field_validator("location")
    @classmethod
    def normalize_location(cls, value: str) -> str:
        """Trim and validate non-empty location text."""
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("location cannot be empty")
        return cleaned

    @field_validator("notes")
    @classmethod
    def normalize_notes(cls, value: str) -> str:
        """Trim notes text before persistence."""
        return value.strip()


class PersonCreate(PersonBase):
    """Payload used when creating a new person."""


class PersonUpdate(BaseModel):
    """Partial payload used for quick updates on today's snapshot."""

    full_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    location: Optional[str] = Field(default=None, min_length=1, max_length=LOCATION_MAX_LENGTH)
    daily_status: Optional[DailyStatusType] = None
    self_location: Optional[str] = Field(default=None, min_length=1, max_length=LOCATION_MAX_LENGTH)
    self_daily_status: Optional[SelfReportStatusType] = None
    notes: Optional[str] = Field(default=None, max_length=500)

    @field_validator("full_name")
    @classmethod
    def normalize_optional_name(cls, value: Optional[str]) -> Optional[str]:
        """Trim optional name, while preserving None for partial updates."""
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("full_name cannot be empty")
        return cleaned

    @field_validator("location")
    @classmethod
    def normalize_optional_location(cls, value: Optional[str]) -> Optional[str]:
        """Trim optional location, while preserving None for partial updates."""
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("location cannot be empty")
        return cleaned

    @field_validator("self_location")
    @classmethod
    def normalize_optional_self_location(cls, value: Optional[str]) -> Optional[str]:
        """Trim optional self-location value while preserving None."""
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("self_location cannot be empty")
        return cleaned

    @field_validator("notes")
    @classmethod
    def normalize_optional_notes(cls, value: Optional[str]) -> Optional[str]:
        """Trim optional notes, while preserving None for partial updates."""
        if value is None:
            return value
        return value.strip()


class PersonRecord(BaseModel):
    """Single row returned to the client for a person within a snapshot."""

    person_id: str
    full_name: str
    location: str
    daily_status: DailyStatusType
    self_location: Optional[str] = None
    self_daily_status: Optional[SelfReportStatusType] = None
    notes: str
    last_updated: str
    date: date


class LocationEventCreate(BaseModel):
    """Payload for creating one location tracking event for a person."""

    location: str = Field(..., min_length=1, max_length=LOCATION_MAX_LENGTH)
    daily_status: Optional[DailyStatusType] = None
    occurred_at: Optional[str] = None

    @field_validator("location")
    @classmethod
    def normalize_location(cls, value: str) -> str:
        """Trim and validate non-empty location text."""
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("location cannot be empty")
        return cleaned

    @field_validator("occurred_at")
    @classmethod
    def normalize_occurred_at(cls, value: Optional[str]) -> Optional[str]:
        """Trim optional occurred_at timestamp."""
        if value is None:
            return value
        cleaned = value.strip()
        return cleaned or None


class LocationEventRecord(BaseModel):
    """Single location tracking event row."""

    event_id: str
    person_id: str
    event_type: LocationEventType
    location: str
    daily_status: DailyStatusType
    target_event_id: Optional[str] = None
    is_voided: bool
    voided_at: Optional[str] = None
    voided_by_event_id: Optional[str] = None
    occurred_at: str
    created_at: str
    source: str
    date: date


class PersonLocationEventsResponse(BaseModel):
    """Response payload for one person's location tracking timeline on a date."""

    date: date
    person_id: str
    events: list[LocationEventRecord]
    last_action_event_id: Optional[str] = None
    last_action_type: Optional[LocationEventType] = None
    latest_transition_warning: Optional[str] = None


class PersonTransitionRecord(BaseModel):
    """Single transition between two locations in one day timeline."""

    transition_id: str
    person_id: str
    full_name: str
    from_location: str
    to_location: str
    moved_at: str
    from_occurred_at: str
    to_occurred_at: str
    dwell_minutes: int
    from_event_id: str
    to_event_id: str
    date: date


class PersonTransitionsResponse(BaseModel):
    """Response payload for one person's location transitions on a date."""

    date: date
    person_id: str
    transitions: list[PersonTransitionRecord]


class SelfReportUpdate(BaseModel):
    """Payload for self-service status updates (Telegram or any external client)."""

    person_lookup: str = Field(..., min_length=1, max_length=120)
    self_location: str = Field(..., min_length=1, max_length=LOCATION_MAX_LENGTH)
    self_daily_status: SelfReportStatusType

    @field_validator("person_lookup")
    @classmethod
    def normalize_person_lookup(cls, value: str) -> str:
        """Trim lookup text (person_id or full_name)."""
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("person_lookup cannot be empty")
        return cleaned

    @field_validator("self_location")
    @classmethod
    def normalize_self_location(cls, value: str) -> str:
        """Trim and validate self-location."""
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("self_location cannot be empty")
        return cleaned


class SnapshotResponse(BaseModel):
    """Response for snapshot endpoints."""

    date: date
    people: list[PersonRecord]


class AvailableDatesResponse(BaseModel):
    """Response for available history dates."""

    dates: list[date]


class LocationCreate(BaseModel):
    """Payload for creating a new location option."""

    location: str = Field(..., min_length=1, max_length=LOCATION_MAX_LENGTH)

    @field_validator("location")
    @classmethod
    def normalize_location_name(cls, value: str) -> str:
        """Trim and validate non-empty location name."""
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("location cannot be empty")
        return cleaned


class LocationListResponse(BaseModel):
    """Response model for available location options."""

    locations: list[str]


class SystemStatusResponse(BaseModel):
    """Response model for backend runtime integrations status."""

    server_date: date
    server_time_utc: str
    telegram_enabled: bool
    telegram_configured: bool
    telegram_running: bool
    telegram_healthy: bool
    telegram_active: bool
    telegram_message: str
    telegram_last_error: Optional[str] = None


class InitialPeopleListCreate(BaseModel):
    """Payload for bulk creation of initial people names."""

    names: list[str] = Field(default_factory=list)

    @field_validator("names")
    @classmethod
    def normalize_names(cls, value: list[str]) -> list[str]:
        """Trim names, remove empties, and keep unique values (case-insensitive)."""
        unique_names: list[str] = []
        seen: set[str] = set()
        for raw_name in value:
            cleaned_name = str(raw_name).strip()
            if len(cleaned_name) < 2:
                continue
            name_key = cleaned_name.lower()
            if name_key in seen:
                continue
            seen.add(name_key)
            unique_names.append(cleaned_name)

        if not unique_names:
            raise ValueError("At least one valid full name is required")
        return unique_names


class InitialPeopleListResponse(BaseModel):
    """Response summary for bulk initial people creation."""

    created_count: int
    skipped_count: int
    created_names: list[str]
    skipped_names: list[str]
