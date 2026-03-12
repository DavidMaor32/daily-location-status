from __future__ import annotations

from datetime import date, timedelta
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import pandas as pd

from app.config import Settings
from app.models import PersonUpdate
from app.services.snapshot_service import (
    DEFAULT_DAILY_STATUS,
    DEFAULT_LOCATION,
    MAX_LOCATION_LENGTH,
    SnapshotService,
)
from app.storage.providers import LocalStorageProvider
from app.exceptions import NotFoundError, ValidationError


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
    seed_file = tmp_path / "seed_people.xlsx"
    pd.DataFrame([{"full_name": name} for name in seed_names]).to_excel(seed_file, index=False)
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


def test_delete_snapshot_for_date_removes_daily_workbook_and_legacy_events_file(tmp_path: Path) -> None:
    """Deleting one date should remove daily workbook and optional legacy events file for that date."""
    service = _build_service(tmp_path=tmp_path, seed_names=["Alice"])
    target_date = date.today() - timedelta(days=3)
    service.ensure_snapshot_for_date(target_date)
    service.save_location_events(target_date, pd.DataFrame())

    snapshot_key = f"{service.settings.s3_snapshots_prefix}/{target_date.isoformat()}.xlsx"
    legacy_events_key = f"{service.settings.s3_snapshots_prefix}_events/{target_date.isoformat()}.xlsx"
    service.storage.write_bytes(legacy_events_key, b"legacy-events")
    assert service.storage.exists(snapshot_key)
    assert service.storage.exists(legacy_events_key)

    payload = service.delete_snapshot_for_date(target_date)
    assert payload["date"] == target_date.isoformat()
    assert payload["snapshot_deleted"] is True
    assert payload["events_existed"] is True
    assert payload["snapshot_events_existed"] is False
    assert payload["legacy_events_existed"] is True
    assert payload["events_deleted"] is True
    assert payload["snapshot_events_deleted"] is False
    assert payload["snapshot_key"] == snapshot_key
    assert payload["events_key"] == f"{snapshot_key}#location_events"
    assert payload["legacy_events_key"] == legacy_events_key
    assert payload["legacy_events_deleted"] is True
    assert not service.storage.exists(snapshot_key)
    assert not service.storage.exists(legacy_events_key)
    assert target_date not in service.list_available_dates()

    try:
        service.delete_snapshot_for_date(target_date)
        assert False, "Expected NotFoundError for already deleted snapshot date"
    except NotFoundError:
        pass


def test_delete_snapshot_for_date_reports_no_events_deleted_when_none_existed(tmp_path: Path) -> None:
    """Deleting a date with no event rows should not report events_deleted=true."""
    service = _build_service(tmp_path=tmp_path, seed_names=["Alice"])
    target_date = date.today() - timedelta(days=4)
    service.ensure_snapshot_for_date(target_date)

    payload = service.delete_snapshot_for_date(target_date)
    assert payload["date"] == target_date.isoformat()
    assert payload["snapshot_deleted"] is True
    assert payload["events_existed"] is False
    assert payload["snapshot_events_existed"] is False
    assert payload["legacy_events_existed"] is False
    assert payload["events_deleted"] is False
    assert payload["snapshot_events_deleted"] is False
    assert payload["legacy_events_deleted"] is False


def test_add_location_event_writes_daily_workbook_once(tmp_path: Path, monkeypatch) -> None:
    """Adding one location event should persist the daily workbook exactly once."""
    service = _build_service(tmp_path=tmp_path, seed_names=["Alice"])
    today = date.today()
    snapshot_key = f"{service.settings.s3_snapshots_prefix}/{today.isoformat()}.xlsx"
    person_id = str(service.get_today_snapshot()["people"][0]["person_id"])
    write_calls: list[str] = []

    original_write_bytes = service.storage.write_bytes

    def _counting_write_bytes(key: str, content: bytes) -> None:
        write_calls.append(key)
        original_write_bytes(key, content)

    monkeypatch.setattr(service.storage, "write_bytes", _counting_write_bytes)
    service.add_location_event_today(person_id=person_id, location="מיקום 1", daily_status="תקין")

    assert write_calls.count(snapshot_key) == 1


def test_update_person_location_writes_daily_workbook_once(tmp_path: Path, monkeypatch) -> None:
    """Quick update location should append event and persist workbook only once."""
    service = _build_service(tmp_path=tmp_path, seed_names=["Alice"])
    today = date.today()
    snapshot_key = f"{service.settings.s3_snapshots_prefix}/{today.isoformat()}.xlsx"
    person_id = str(service.get_today_snapshot()["people"][0]["person_id"])
    write_calls: list[str] = []

    original_write_bytes = service.storage.write_bytes

    def _counting_write_bytes(key: str, content: bytes) -> None:
        write_calls.append(key)
        original_write_bytes(key, content)

    monkeypatch.setattr(service.storage, "write_bytes", _counting_write_bytes)
    service.update_person_today(person_id, PersonUpdate(location="מיקום 2"))

    assert write_calls.count(snapshot_key) == 1


def test_initialize_snapshot_migrates_legacy_once_with_marker(tmp_path: Path, monkeypatch) -> None:
    """Startup flow should run legacy migration once and skip it after marker is created."""
    seed_file = tmp_path / "seed_people.xlsx"
    pd.DataFrame([{"full_name": "Alice"}]).to_excel(seed_file, index=False)
    settings = _build_settings(tmp_path=tmp_path, seed_file=seed_file)
    storage = LocalStorageProvider(settings.local_storage_dir)
    service = SnapshotService(settings=settings, storage=storage)

    calls = {"migrate": 0}

    def _fake_migrate(self: SnapshotService) -> dict:
        calls["migrate"] += 1
        return {"migrated_count": 0, "migrated_dates": [], "skipped_keys": []}

    monkeypatch.setattr(SnapshotService, "migrate_legacy_location_events", _fake_migrate)
    service.initialize_today_snapshot()
    service.initialize_today_snapshot()

    assert calls["migrate"] == 1
    assert service.storage.exists(service._legacy_location_events_migration_marker_key())


def test_migrate_legacy_events_moves_rows_into_snapshot_sheet(tmp_path: Path) -> None:
    """Legacy snapshots_events file should be merged into same-day snapshot workbook sheet."""
    service = _build_service(tmp_path=tmp_path, seed_names=["Alice"])
    target_date = date.today() - timedelta(days=2)
    target_df = service.ensure_snapshot_for_date(target_date)
    person_id = str(target_df.iloc[0]["person_id"])

    legacy_events_key = f"{service.settings.s3_snapshots_prefix}_events/{target_date.isoformat()}.xlsx"
    legacy_df = pd.DataFrame(
        [
            {
                "event_id": "E-legacy-1",
                "person_id": person_id,
                "event_type": "move",
                "location": "מיקום 2",
                "daily_status": "תקין",
                "occurred_at": "2026-03-10T08:00:00",
                "created_at": "2026-03-10T08:00:00",
                "source": "legacy-test",
                "date": target_date.isoformat(),
            }
        ]
    )
    service.storage.write_bytes(legacy_events_key, service._to_excel_bytes(legacy_df))
    assert service.storage.exists(legacy_events_key)

    result = service.migrate_legacy_location_events()
    assert result["migrated_count"] >= 1
    assert target_date.isoformat() in result["migrated_dates"]
    assert not service.storage.exists(legacy_events_key)

    migrated_events = service.load_location_events(target_date)
    assert len(migrated_events.index) == 1
    assert migrated_events.iloc[0]["person_id"] == person_id
    assert migrated_events.iloc[0]["location"] == "מיקום 2"

    snapshot_key = f"{service.settings.s3_snapshots_prefix}/{target_date.isoformat()}.xlsx"
    workbook = pd.read_excel(BytesIO(service.storage.read_bytes(snapshot_key)), sheet_name=None, dtype=str)
    assert "snapshot" in workbook
    assert "location_events" in workbook


def test_existing_empty_snapshot_is_rebuilt_from_master_when_create_if_missing(tmp_path: Path) -> None:
    """Existing empty daily snapshot should be repaired from master when no events exist."""
    service = _build_service(tmp_path=tmp_path, seed_names=["Alice", "Bob"])
    target_date = date.today() + timedelta(days=2)
    snapshot_key = f"{service.settings.s3_snapshots_prefix}/{target_date.isoformat()}.xlsx"

    empty_snapshot_df = pd.DataFrame(columns=["person_id", "full_name"])
    empty_events_df = pd.DataFrame(columns=["event_id", "person_id"])
    service.storage.write_bytes(
        snapshot_key,
        service._to_daily_workbook_bytes(empty_snapshot_df, empty_events_df),
    )

    repaired = service.get_snapshot_for_date(target_date, create_if_missing=True)
    repaired_names = sorted(item["full_name"] for item in repaired["people"])
    assert repaired_names == ["Alice", "Bob"]

    repaired_df = service.load_snapshot(target_date, create_if_missing=False)
    assert sorted(repaired_df["full_name"].tolist()) == ["Alice", "Bob"]


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


def test_location_events_add_delete_recalculates_current_snapshot_state(tmp_path: Path) -> None:
    """Hard-deleting tracking events should roll person state back with no deletion trace."""
    service = _build_service(tmp_path=tmp_path, seed_names=["Alice"])
    today = date.today()
    person = service.get_today_snapshot()["people"][0]
    person_id = str(person["person_id"])

    add_first = service.add_location_event_today(
        person_id=person_id,
        location="מיקום 1",
        daily_status="תקין",
    )
    first_event_id = add_first["events"][0]["event_id"]

    add_second = service.add_location_event_today(
        person_id=person_id,
        location="מיקום 3",
        daily_status="לא תקין",
    )
    second_event_id = next(
        item["event_id"] for item in add_second["events"] if item["location"] == "מיקום 3"
    )

    snapshot_after_second = service.get_today_snapshot()
    person_after_second = next(item for item in snapshot_after_second["people"] if item["person_id"] == person_id)
    assert person_after_second["location"] == "מיקום 3"
    assert person_after_second["daily_status"] == "לא תקין"

    service.delete_location_event_today(person_id=person_id, event_id=second_event_id)
    snapshot_after_delete_latest = service.get_today_snapshot()
    person_after_delete_latest = next(
        item for item in snapshot_after_delete_latest["people"] if item["person_id"] == person_id
    )
    assert person_after_delete_latest["location"] == "מיקום 1"
    assert person_after_delete_latest["daily_status"] == "תקין"

    service.delete_location_event_today(person_id=person_id, event_id=first_event_id)
    snapshot_after_delete_all = service.get_today_snapshot()
    person_after_delete_all = next(
        item for item in snapshot_after_delete_all["people"] if item["person_id"] == person_id
    )
    assert person_after_delete_all["location"] == DEFAULT_LOCATION
    assert person_after_delete_all["daily_status"] == DEFAULT_DAILY_STATUS

    events_payload = service.get_person_location_events(person_id, today)
    assert events_payload["events"] == []

    active_only_payload = service.get_person_location_events(person_id, today, include_voided=False)
    assert active_only_payload["events"] == []

    transitions_payload = service.get_person_location_transitions(person_id, today)
    assert transitions_payload["transitions"] == []



def test_daily_location_events_sheet_includes_full_name(tmp_path: Path) -> None:
    """Daily workbook location_events sheet should include full_name for each event row."""
    service = _build_service(tmp_path=tmp_path, seed_names=["Alice"])
    today = date.today()
    person = service.get_today_snapshot()["people"][0]
    person_id = str(person["person_id"])
    full_name = str(person["full_name"])

    service.add_location_event_today(
        person_id=person_id,
        location="מיקום 1",
        daily_status="תקין",
    )

    snapshot_key = f"{service.settings.s3_snapshots_prefix}/{today.isoformat()}.xlsx"
    workbook = pd.read_excel(BytesIO(service.storage.read_bytes(snapshot_key)), sheet_name=None, dtype=str)
    location_events_sheet = workbook["location_events"].fillna("")

    assert "full_name" in location_events_sheet.columns
    person_rows = location_events_sheet[
        location_events_sheet["person_id"].astype(str) == person_id
    ]
    assert not person_rows.empty
    assert set(person_rows["full_name"].tolist()) == {full_name}


def test_export_day_excel_contains_location_tracking_history(tmp_path: Path) -> None:
    """Day export workbook should include snapshot, events, and transitions sheets."""
    service = _build_service(tmp_path=tmp_path, seed_names=["Alice"])
    today = date.today()
    person_id = str(service.get_today_snapshot()["people"][0]["person_id"])

    service.add_location_event_today(
        person_id=person_id,
        location="מיקום 1",
        daily_status="תקין",
    )
    service.add_location_event_today(
        person_id=person_id,
        location="מיקום 2",
        daily_status="לא תקין",
    )

    filename, content = service.get_snapshot_excel_bytes(today, create_if_missing=False)
    assert filename == f"{today.isoformat()}.xlsx"

    workbook = pd.read_excel(BytesIO(content), sheet_name=None, dtype=str)
    assert "snapshot" in workbook
    assert "location_events" in workbook
    assert "transitions" in workbook

    snapshot_sheet = workbook["snapshot"].fillna("")
    events_sheet = workbook["location_events"].fillna("")
    transitions_sheet = workbook["transitions"].fillna("")

    alice_row = snapshot_sheet.loc[snapshot_sheet["full_name"] == "Alice"].iloc[0]
    assert alice_row["locations_visited"] == "מיקום 1 -> מיקום 2"
    assert int(alice_row["location_events_count"]) == 2
    assert "מיקום 1" in alice_row["location_timeline"]
    assert "מיקום 2" in alice_row["location_timeline"]
    assert "שעה:" in alice_row["location_timeline"]
    assert "מיקום:" in alice_row["location_timeline"]
    assert "סטטוס:" in alice_row["location_timeline"]
    assert "\n" in alice_row["location_timeline"]

    assert len(events_sheet.index) == 2
    assert set(events_sheet["full_name"].tolist()) == {"Alice"}
    assert set(events_sheet["location"].tolist()) == {"מיקום 1", "מיקום 2"}
    assert set(events_sheet["event_type"].tolist()) == {"move"}

    assert len(transitions_sheet.index) == 1
    transition_row = transitions_sheet.iloc[0]
    assert transition_row["full_name"] == "Alice"
    assert transition_row["from_location"] == "מיקום 1"
    assert transition_row["to_location"] == "מיקום 2"


def test_export_range_zip_contains_workbooks_with_tracking_sheet(tmp_path: Path) -> None:
    """Range zip export should contain daily workbooks with events and transitions sheets."""
    service = _build_service(tmp_path=tmp_path, seed_names=["Alice"])
    today = date.today()
    yesterday = today - timedelta(days=1)
    service.ensure_snapshot_for_date(yesterday)

    person_id = str(service.get_today_snapshot()["people"][0]["person_id"])
    service.add_location_event_today(
        person_id=person_id,
        location="מיקום 3",
        daily_status="תקין",
    )

    filename, content = service.get_snapshots_zip_bytes(yesterday, today)
    assert filename == f"snapshots_{yesterday.isoformat()}_to_{today.isoformat()}.zip"

    with ZipFile(BytesIO(content), mode="r") as archive:
        names = set(archive.namelist())
        assert f"{yesterday.isoformat()}.xlsx" in names
        assert f"{today.isoformat()}.xlsx" in names

        today_content = archive.read(f"{today.isoformat()}.xlsx")
        today_workbook = pd.read_excel(BytesIO(today_content), sheet_name=None, dtype=str)
        assert "snapshot" in today_workbook
        assert "location_events" in today_workbook
        assert "transitions" in today_workbook

