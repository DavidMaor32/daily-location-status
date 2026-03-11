"""Pydantic models for request/response payloads."""

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


DailyStatusType = Literal["תקין", "לא תקין"]
LOCATION_MAX_LENGTH = 80


class PersonBase(BaseModel):
    """Shared fields for create/update person operations."""

    full_name: str = Field(..., min_length=2, max_length=120)
    location: str = Field(default="בבית", min_length=1, max_length=LOCATION_MAX_LENGTH)
    daily_status: DailyStatusType = "תקין"
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
    notes: str
    last_updated: str
    date: date


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
