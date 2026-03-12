from __future__ import annotations

from abc import ABC, abstractmethod


class StorageProvider(ABC):
    """Abstraction layer for file storage backends (S3/local)."""

    @abstractmethod
    def exists(self, key: str) -> bool:
        """Return True when object identified by key exists."""
        raise NotImplementedError

    @abstractmethod
    def read_bytes(self, key: str) -> bytes:
        """Read object bytes for key."""
        raise NotImplementedError

    @abstractmethod
    def write_bytes(self, key: str, content: bytes) -> None:
        """Persist object bytes under key."""
        raise NotImplementedError

    @abstractmethod
    def delete(self, key: str) -> bool:
        """Delete object by key and return True when object existed and was removed."""
        raise NotImplementedError

    @abstractmethod
    def list_keys(self, prefix: str) -> list[str]:
        """List keys that match a given prefix."""
        raise NotImplementedError
