from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

import pandas as pd

from app.config import Settings
from app.services.snapshot_service import (
    DEFAULT_DAILY_STATUS,
    DEFAULT_LOCATION,
    MAX_LOCATION_LENGTH,
    SnapshotService,
)
from app.storage.providers import LocalStorageProvider
from app.exceptions import ValidationError


def _build_settings(
    tmp_path: Path,
    seed_file: Path,
    restore_policy: str = "exact_snapshot",
) -> Settings:
    """Build test settings object for local storage mode."""
    return Settings(
        config_file_path=tmp_path / "app_config.yaml",
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
        snapshot_restore_policy=restore_policy,
        local_storage_dir=tmp_path / "storage",
        seed_people_file=seed_file,
        cors_origins=["http://localhost:5173"],
        write_api_key=None,
        telegram_bot_enabled=False,
        telegram_bot_token=None,
        telegram_allowed_chat_ids=[],
        telegram_allowed_remote_names=[],
        telegram_poll_timeout_seconds=25,
        telegram_poll_retry_seconds=3,
    )


def _build_service(
    tmp_path: Path,
    seed_names: list[str],
    restore_policy: str = "exact_snapshot",
) -> SnapshotService:
    """Create ready-to-use snapshot service with seed master people."""
    seed_file = tmp_path / "seed_people.csv"
    pd.DataFrame([{"full_name": name} for name in seed_names]).to_csv(seed_file, index=False)
    settings = _build_settings(tmp_path=tmp_path, seed_file=seed_file, restore_policy=restore_policy)
    storage = LocalStorageProvider(settings.local_storage_dir)
    service = SnapshotService(settings=settings, storage=storage)
    service.initialize_today_snapshot()
    return service


def test_new_day_snapshot_uses_master_people_and_resets_daily_fields(tmp_path: Path) -> None:
    """New date snapshot should copy only people list from master and reset daily fields."""
    service = _build_service(tmp_path=tmp_path, seed_names=["Alice", "Bob"])
    today = date.today()

    today_df = service.load_snapshot(today, create_if_missing=False)
    today_df.loc[today_df["full_name"] == "Alice", "location"] = "מיקום 4"
    today_df.loc[today_df["full_name"] == "Alice", "daily_status"] = "תקין"
    today_df.loc[today_df["full_name"] == "Alice", "self_location"] = "מיקום 2"
    today_df.loc[today_df["full_name"] == "Alice", "self_daily_status"] = "לא תקין"
    today_df.loc[today_df["full_name"] == "Alice", "notes"] = "old-note"
    service.save_snapshot(today, today_df)

    tomorrow = today + timedelta(days=1)
    tomorrow_df = service.ensure_snapshot_for_date(tomorrow)

    assert set(tomorrow_df["full_name"].tolist()) == {"Alice", "Bob"}
    assert set(tomorrow_df["location"].tolist()) == {DEFAULT_LOCATION}
    assert set(tomorrow_df["daily_status"].tolist()) == {DEFAULT_DAILY_STATUS}
    assert set(tomorrow_df["self_location"].tolist()) == {""}
    assert set(tomorrow_df["self_daily_status"].tolist()) == {""}
    assert set(tomorrow_df["notes"].tolist()) == {""}


def test_restore_exact_snapshot_includes_people_deleted_from_master(tmp_path: Path) -> None:
    """Restore with exact policy should restore historical rows even if removed from master."""
    service = _build_service(
        tmp_path=tmp_path,
        seed_names=["Alice", "Bob"],
        restore_policy="exact_snapshot",
    )
    today = date.today()
    yesterday = today - timedelta(days=1)

    # Build yesterday with explicit values to verify exact restore.
    yesterday_df = service.ensure_snapshot_for_date(yesterday)
    yesterday_df.loc[yesterday_df["full_name"] == "Bob", "location"] = "מיקום 3"
    yesterday_df.loc[yesterday_df["full_name"] == "Bob", "daily_status"] = "תקין"
    yesterday_df.loc[yesterday_df["full_name"] == "Bob", "notes"] = "historical-bob"
    service.save_snapshot(yesterday, yesterday_df)

    # Delete Bob from today (also removes from master).
    today_snapshot = service.get_today_snapshot()
    bob_row = next(item for item in today_snapshot["people"] if item["full_name"] == "Bob")
    service.delete_person_today(str(bob_row["person_id"]))

    service.restore_snapshot_to_today(yesterday)
    restored_today_df = service.load_snapshot(today, create_if_missing=False)

    assert "Bob" in restored_today_df["full_name"].tolist()
    bob_restored = restored_today_df.loc[restored_today_df["full_name"] == "Bob"].iloc[0]
    assert bob_restored["notes"] == "historical-bob"


def test_restore_master_only_keeps_only_active_master_people(tmp_path: Path) -> None:
    """Restore with master_only should ignore historical people no longer in master."""
    service = _build_service(
        tmp_path=tmp_path,
        seed_names=["Alice", "Bob"],
        restore_policy="master_only",
    )
    today = date.today()
    yesterday = today - timedelta(days=1)

    service.ensure_snapshot_for_date(yesterday)

    # Delete Bob from today (also removes from master).
    today_snapshot = service.get_today_snapshot()
    bob_row = next(item for item in today_snapshot["people"] if item["full_name"] == "Bob")
    service.delete_person_today(str(bob_row["person_id"]))

    service.restore_snapshot_to_today(yesterday)
    restored_today_df = service.load_snapshot(today, create_if_missing=False)

    assert set(restored_today_df["full_name"].tolist()) == {"Alice"}


def test_add_initial_people_today_deduplicates_and_updates_master_and_snapshot(tmp_path: Path) -> None:
    """Bulk initial people import should skip duplicates and update master/today snapshot once."""
    service = _build_service(tmp_path=tmp_path, seed_names=["Alice"])

    result = service.add_initial_people_today(["Alice", "Bob", "bob", "Dana"])
    assert result["created_count"] == 2
    assert result["skipped_count"] == 1
    assert set(result["created_names"]) == {"Bob", "Dana"}
    assert result["skipped_names"] == ["Alice"]

    master_df = service.load_master_people()
    today_df = service.load_snapshot(date.today(), create_if_missing=False)

    assert set(master_df["full_name"].tolist()) == {"Alice", "Bob", "Dana"}
    assert set(today_df["full_name"].tolist()) == {"Alice", "Bob", "Dana"}


def test_load_snapshot_create_if_missing_builds_missing_past_date(tmp_path: Path) -> None:
    """Missing historical date should be auto-created from master when requested with create_if_missing."""
    service = _build_service(tmp_path=tmp_path, seed_names=["Alice", "Bob"])
    past_date = date.today() - timedelta(days=7)

    past_df = service.load_snapshot(past_date, create_if_missing=True)

    assert set(past_df["full_name"].tolist()) == {"Alice", "Bob"}
    assert set(past_df["location"].tolist()) == {DEFAULT_LOCATION}
    assert set(past_df["daily_status"].tolist()) == {DEFAULT_DAILY_STATUS}


def test_update_self_report_rejects_too_long_location(tmp_path: Path) -> None:
    """Self-report location should be validated to avoid oversized user input."""
    service = _build_service(tmp_path=tmp_path, seed_names=["Alice"])
    long_location = "L" * (MAX_LOCATION_LENGTH + 1)

    try:
        service.update_self_report_today(
            person_lookup="Alice",
            self_location=long_location,
            self_daily_status="\u05ea\u05e7\u05d9\u05df",
        )
        assert False, "Expected ValidationError for overly long self_location"
    except ValidationError as exc:
        assert "self_location" in str(exc)

