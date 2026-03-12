"""Resilience guard tests for startup/runtime safeguards and failure handling paths.

Responsibility: ensure defensive behavior stays stable under invalid state and fault scenarios.
"""

from __future__ import annotations

import time
from pathlib import Path

import pytest

from app.config import Settings
from app.exceptions import StorageError, ValidationError
from app.services.telegram_bot_service import (
    STATE_WAITING_LOCATION,
    STATUS_OPTIONS,
    TelegramBotService,
)
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

    def delete(self, key: str) -> bool:
        if key not in self._objects:
            return False
        del self._objects[key]
        return True

    def list_keys(self, prefix: str) -> list[str]:
        return [key for key in self._objects if key.startswith(prefix)]


class _DummySnapshotService:
    """Placeholder snapshot service for Telegram service tests."""


class _MutableLocationsSnapshotService:
    """Minimal snapshot service with mutable configured locations for Telegram flow tests."""

    def __init__(self, locations: list[str]) -> None:
        self.locations = list(locations)

    def get_locations(self) -> list[str]:
        return list(self.locations)

    def update_self_report_today(
        self,
        *,
        person_lookup: str,
        self_location: str,
        self_daily_status: str,
        source: str = "self_report_bot",
    ) -> dict:
        if self_location not in self.locations:
            options_preview = ", ".join(self.locations)
            raise ValidationError(
                f"self_location must be one of configured locations: {options_preview}"
            )
        return {
            "person_id": person_lookup,
            "full_name": person_lookup,
            "self_location": self_location,
            "self_daily_status": self_daily_status,
        }


def _build_settings(
    tmp_path: Path,
    *,
    telegram_enabled: bool = True,
    telegram_allowed_remote_names: list[str] | None = None,
) -> Settings:
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
        seed_people_file=tmp_path / "seed.xlsx",
        cors_origins=["http://localhost:5173"],
        telegram_bot_enabled=telegram_enabled,
        telegram_bot_token="token-for-tests",
        telegram_allowed_chat_ids=[],
        telegram_allowed_remote_names=telegram_allowed_remote_names or [],
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


def test_prompt_name_step_hides_name_options_in_open_mode(tmp_path: Path, monkeypatch) -> None:
    """Name step must not expose optional person names as Telegram keyboard choices."""
    settings = _build_settings(tmp_path=tmp_path, telegram_enabled=True)
    service = TelegramBotService(settings=settings, snapshot_service=_DummySnapshotService())
    sent_payload: dict = {}

    def _fake_send_message(self, chat_id: int, text: str, reply_markup: dict | None = None) -> None:
        sent_payload["chat_id"] = chat_id
        sent_payload["text"] = text
        sent_payload["reply_markup"] = reply_markup

    monkeypatch.setattr(TelegramBotService, "_send_message", _fake_send_message)
    service._prompt_name_step(
        123,
        [{"label": "Alice", "full_name": "Alice", "person_lookup": "1"}],
    )

    assert sent_payload["chat_id"] == 123
    assert sent_payload["reply_markup"] == {"remove_keyboard": True}


def test_prompt_name_step_hides_name_options_in_whitelist_mode(tmp_path: Path, monkeypatch) -> None:
    """Whitelist mode should also keep name entry as free text (no suggested names)."""
    settings = _build_settings(
        tmp_path=tmp_path,
        telegram_enabled=True,
        telegram_allowed_remote_names=["Alice"],
    )
    service = TelegramBotService(settings=settings, snapshot_service=_DummySnapshotService())
    sent_payload: dict = {}

    def _fake_send_message(self, chat_id: int, text: str, reply_markup: dict | None = None) -> None:
        sent_payload["chat_id"] = chat_id
        sent_payload["text"] = text
        sent_payload["reply_markup"] = reply_markup

    monkeypatch.setattr(TelegramBotService, "_send_message", _fake_send_message)
    service._prompt_name_step(
        456,
        [{"label": "Alice", "full_name": "Alice", "person_lookup": "1"}],
    )

    assert sent_payload["chat_id"] == 456
    assert sent_payload["reply_markup"] == {"remove_keyboard": True}


def test_waiting_name_invalid_in_whitelist_keeps_keyboard_hidden(tmp_path: Path, monkeypatch) -> None:
    """Validation errors for invalid names must not show suggested names keyboard."""
    settings = _build_settings(
        tmp_path=tmp_path,
        telegram_enabled=True,
        telegram_allowed_remote_names=["Alice"],
    )
    service = TelegramBotService(settings=settings, snapshot_service=_DummySnapshotService())
    captured_error: dict = {}

    def _fake_validation_error(
        self, chat_id: int, message: str, reply_markup: dict
    ) -> None:
        captured_error["chat_id"] = chat_id
        captured_error["message"] = message
        captured_error["reply_markup"] = reply_markup

    monkeypatch.setattr(TelegramBotService, "_send_step_validation_error", _fake_validation_error)
    service._handle_waiting_name(
        789,
        "Unknown Name",
        {
            "person_options": [
                {"label": "Alice", "full_name": "Alice", "person_lookup": "1"},
            ]
        },
    )

    assert captured_error["chat_id"] == 789
    assert captured_error["reply_markup"] == {"remove_keyboard": True}


def test_waiting_location_uses_latest_configured_locations(tmp_path: Path, monkeypatch) -> None:
    """Location step must validate against current configured locations, not stale conversation cache."""
    settings = _build_settings(tmp_path=tmp_path, telegram_enabled=True)
    snapshot_service = _MutableLocationsSnapshotService(["HQ", "Site A"])
    service = TelegramBotService(settings=settings, snapshot_service=snapshot_service)
    captured_error: dict = {}

    def _fake_validation_error(
        self, chat_id: int, message: str, reply_markup: dict
    ) -> None:
        captured_error["chat_id"] = chat_id
        captured_error["message"] = message
        captured_error["reply_markup"] = reply_markup

    monkeypatch.setattr(TelegramBotService, "_send_step_validation_error", _fake_validation_error)
    # Simulate stale conversation data that still includes a removed location.
    conversation = {
        "person_lookup": "1",
        "person_name": "Alice",
        "locations": ["HQ", "Site A", "Old Site"],
    }
    service._handle_waiting_location(1001, "Old Site", conversation)

    keyboard_rows = captured_error["reply_markup"]["keyboard"]
    keyboard_items = [item for row in keyboard_rows for item in row]
    assert captured_error["chat_id"] == 1001
    assert set(keyboard_items) == {"HQ", "Site A"}
    assert "Old Site" not in keyboard_items


def test_waiting_status_restarts_location_step_when_selected_location_removed(
    tmp_path: Path, monkeypatch
) -> None:
    """If selected location is deleted between steps, flow must return to location step with fresh keyboard."""
    settings = _build_settings(tmp_path=tmp_path, telegram_enabled=True)
    snapshot_service = _MutableLocationsSnapshotService(["HQ", "Site A"])
    service = TelegramBotService(settings=settings, snapshot_service=snapshot_service)
    captured_error: dict = {}

    def _fake_validation_error(
        self, chat_id: int, message: str, reply_markup: dict
    ) -> None:
        captured_error["chat_id"] = chat_id
        captured_error["message"] = message
        captured_error["reply_markup"] = reply_markup

    monkeypatch.setattr(TelegramBotService, "_send_step_validation_error", _fake_validation_error)
    service._handle_waiting_status(
        1002,
        STATUS_OPTIONS[0],
        {
            "person_lookup": "1",
            "person_name": "Alice",
            "selected_location": "Old Site",
        },
    )

    conversation = service._get_conversation(1002)
    keyboard_rows = captured_error["reply_markup"]["keyboard"]
    keyboard_items = [item for row in keyboard_rows for item in row]

    assert conversation is not None
    assert conversation["state"] == STATE_WAITING_LOCATION
    assert conversation["person_lookup"] == "1"
    assert conversation["person_name"] == "Alice"
    assert set(keyboard_items) == {"HQ", "Site A"}
    assert "Old Site" not in keyboard_items
