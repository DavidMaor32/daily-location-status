from __future__ import annotations

import time
from pathlib import Path

import pytest

from app.config import Settings
from app.exceptions import StorageError
from app.services.telegram_bot_service import TelegramBotService
from app.storage.providers import MirroredStorageProvider


class _InMemoryProvider:
    """Minimal in-memory storage provider used by resilience tests."""

    def __init__(self, *, fail_write: bool = False) -> None:
        self._objects: dict[str, bytes] = {}
        self.fail_write = fail_write
        self.write_attempts = 0

    def exists(self, key: str) -> bool:
        return key in self._objects

    def read_bytes(self, key: str) -> bytes:
        if key not in self._objects:
            raise StorageError(f"Missing key: {key}")
        return self._objects[key]

    def write_bytes(self, key: str, content: bytes) -> None:
        self.write_attempts += 1
        if self.fail_write:
            raise StorageError("Simulated write failure")
        self._objects[key] = content

    def list_keys(self, prefix: str) -> list[str]:
        return [key for key in self._objects if key.startswith(prefix)]


class _DummySnapshotService:
    """Placeholder snapshot service for Telegram service startup tests."""


def _build_settings(tmp_path: Path, *, telegram_enabled: bool = True) -> Settings:
    """Create Settings object with local storage for isolated tests."""
    return Settings(
        config_file_path=tmp_path / "config.yaml",
        app_name="test-app",
        environment="test",
        storage_mode="local",
        aws_access_key_id=None,
        aws_secret_access_key=None,
        aws_session_token=None,
        aws_region_name="us-east-1",
        s3_bucket_name=None,
        s3_snapshots_prefix="snapshots",
        s3_master_key="master/people_master.xlsx",
        s3_locations_key="master/locations.xlsx",
        snapshot_restore_policy="exact_snapshot",
        local_storage_dir=tmp_path / "storage",
        seed_people_file=tmp_path / "seed.csv",
        cors_origins=["http://localhost:5173"],
        telegram_bot_enabled=telegram_enabled,
        telegram_bot_token="token-for-tests",
        telegram_allowed_chat_ids=[],
        telegram_allowed_remote_names=[],
        telegram_poll_timeout_seconds=25,
        telegram_poll_retry_seconds=1,
    )


def test_mirrored_storage_write_raises_when_mirror_fails() -> None:
    """
    In local_and_s3 mode behavior, mirror write failures must be surfaced.

    Primary write still succeeds, but request should fail so caller knows S3 is out of sync.
    """
    primary = _InMemoryProvider()
    mirror = _InMemoryProvider(fail_write=True)
    provider = MirroredStorageProvider(primary=primary, mirror=mirror)

    key = "snapshots/2026-03-11.xlsx"
    content = b"excel-bytes"
    with pytest.raises(StorageError, match="Mirror write failed"):
        provider.write_bytes(key, content)

    assert primary.read_bytes(key) == content
    assert mirror.write_attempts == 2


def test_telegram_poller_singleton_lock_blocks_second_instance(tmp_path: Path, monkeypatch) -> None:
    """Only one Telegram polling worker should run per machine/process group."""

    def _fake_poll_loop(self: TelegramBotService) -> None:
        self._stop_event.wait(5)

    monkeypatch.setattr(TelegramBotService, "_run_poll_loop", _fake_poll_loop)
    settings = _build_settings(tmp_path=tmp_path, telegram_enabled=True)

    first = TelegramBotService(settings=settings, snapshot_service=_DummySnapshotService())
    second = TelegramBotService(settings=settings, snapshot_service=_DummySnapshotService())

    try:
        first.start()
        # Let first worker mark thread as alive before starting second worker.
        time.sleep(0.1)
        second.start()

        first_status = first.get_runtime_status()
        second_status = second.get_runtime_status()

        assert first_status["telegram_running"] is True
        assert second_status["telegram_running"] is False
        assert second_status["telegram_active"] is False
        assert "another process" in str(second_status["telegram_last_error"]).lower()
    finally:
        second.stop()
        first.stop()
