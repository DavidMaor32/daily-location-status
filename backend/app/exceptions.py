"""Application-level exception hierarchy used across API and services."""

from __future__ import annotations


class AppError(Exception):
    """Base application exception."""


class NotFoundError(AppError):
    """Raised when requested data does not exist."""


class ValidationError(AppError):
    """Raised when business validation fails."""


class StorageError(AppError):
    """Raised when storage read/write operations fail."""
