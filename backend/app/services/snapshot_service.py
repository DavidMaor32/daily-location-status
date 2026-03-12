"""Core snapshot domain service handling people state, location events, and date history.

Responsibility: enforce business rules and coordinate persistence across storage providers.
"""

from __future__ import annotations

import json
import logging
import threading
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime, timezone
from io import BytesIO
from pathlib import Path
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile

import pandas as pd

from app.config import Settings
from app.exceptions import NotFoundError, StorageError, ValidationError
from app.models import PersonCreate, PersonUpdate
from app.storage.base import StorageProvider
from app.utils.file_lock import ProcessFileLock


logger = logging.getLogger(__name__)

SNAPSHOT_COLUMNS = [
    "person_id",
    "full_name",
    "location",
    "daily_status",
    "self_location",
    "self_daily_status",
    "notes",
    "last_updated",
    "date",
]
MASTER_COLUMNS = ["person_id", "full_name"]
LOCATION_COLUMNS = ["location", "created_at"]
LOCATION_EVENT_COLUMNS = [
    "event_id",
    "person_id",
    "full_name",
    "event_type",
    "target_event_id",
    "is_voided",
    "voided_at",
    "voided_by_event_id",
    "location",
    "daily_status",
    "occurred_at",
    "created_at",
    "source",
    "date",
]
# Backward compatibility for legacy values from old files.
LOCATION_ALIASES = {
    "יחידה": "מיקום 1",
}
DAILY_STATUS_ALIASES: dict[str, str] = {}
VALID_DAILY_STATUS = {"תקין", "לא תקין", "לא הוזן"}
VALID_SELF_DAILY_STATUS = {"תקין", "לא תקין"}
DEFAULT_LOCATION = "בבית"
DEFAULT_DAILY_STATUS = "לא הוזן"
MAX_LOCATION_LENGTH = 80
DEFAULT_LOCATION_OPTIONS = ["בבית", "מיקום 1", "מיקום 2", "מיקום 3", "מיקום 4", "מיקום 5"]
DEFAULT_EVENT_SOURCE = "manual"
VALID_EVENT_TYPES = {"move", "correction", "undo"}
SUSPICIOUS_TRANSITION_SECONDS = 120
TRANSITION_COLUMNS = [
    "transition_id",
    "person_id",
    "full_name",
    "from_location",
    "to_location",
    "moved_at",
    "from_occurred_at",
    "to_occurred_at",
    "dwell_minutes",
    "from_event_id",
    "to_event_id",
    "transition_source",
    "transition_source_raw",
    "date",
]
DAILY_SNAPSHOT_SHEET = "snapshot"
DAILY_LOCATION_EVENTS_SHEET = "location_events"


@dataclass(frozen=True)
class SnapshotCarryPolicy:
    """Define which fields should be copied from source snapshot to target snapshot."""

    carry_location: bool
    carry_daily_status: bool
    carry_notes: bool
    carry_self_report: bool


class SnapshotService:
    """Business logic service that manages daily snapshots and people master list."""

    def __init__(self, settings: Settings, storage: StorageProvider) -> None:
        """Store runtime settings and selected storage provider."""
        self.settings = settings
        self.storage = storage
        # Protect read-modify-write flows within current process.
        self._write_lock = threading.RLock()
        # Protect read-modify-write flows across different backend processes on same machine.
        lock_path = self.settings.local_storage_dir / ".locks" / "snapshot_service.lock"
        self._process_write_lock = ProcessFileLock(lock_path)
        self._write_guard_state = threading.local()

    @contextmanager
    def _write_guard(self):
        """
        Combined write lock guard:
        - thread-level reentrant lock (in-process)
        - process-level file lock (cross-process)
        """
        current_depth = int(getattr(self._write_guard_state, "depth", 0))
        self._write_guard_state.depth = current_depth + 1
        try:
            with self._write_lock:
                if current_depth == 0:
                    try:
                        with self._process_write_lock.locked(timeout_seconds=60):
                            yield
                    except TimeoutError as exc:
                        raise StorageError(
                            "Timed out while waiting for snapshot write lock"
                        ) from exc
                else:
                    yield
        finally:
            self._write_guard_state.depth = current_depth

    def initialize_today_snapshot(self) -> None:
        """Load or create today's snapshot during app startup."""
        self.ensure_master_people()
        self.ensure_locations_file()
        self.ensure_snapshot_for_date(date.today())
        self.migrate_legacy_location_events_once()

    def migrate_legacy_location_events_once(self) -> dict:
        """
        Run legacy events migration once per storage backend using a marker key.

        Re-running can still be done explicitly via `migrate_legacy_location_events()`.
        """
        with self._write_guard():
            marker_key = self._legacy_location_events_migration_marker_key()
            if self.storage.exists(marker_key):
                return {
                    "migration_ran": False,
                    "marker_key": marker_key,
                    "migrated_count": 0,
                    "migrated_dates": [],
                    "skipped_keys": [],
                }

            migration_result = self.migrate_legacy_location_events()
            marker_payload = {
                "checked_at": datetime.now(timezone.utc).isoformat(),
                "migration_result": migration_result,
            }
            marker_bytes = json.dumps(marker_payload, ensure_ascii=False).encode("utf-8")
            self.storage.write_bytes(marker_key, marker_bytes)

            return {
                "migration_ran": True,
                "marker_key": marker_key,
                **migration_result,
            }

    def get_today_snapshot(self) -> dict:
        """Return today's full snapshot, creating it when missing."""
        today = date.today()
        return self.get_snapshot_for_date(today, create_if_missing=True)

    def get_snapshot_for_date(self, snapshot_date: date, create_if_missing: bool = False) -> dict:
        """Return a normalized snapshot payload for a requested date."""
        df = self.load_snapshot(snapshot_date, create_if_missing=create_if_missing)
        people = [self._row_to_record(row) for _, row in df.iterrows()]
        return {"date": snapshot_date, "people": people}

    def save_snapshot_for_date(self, snapshot_date: date, create_if_missing: bool = True) -> dict:
        """
        Force-save snapshot file for a given date.

        Useful for an explicit "Save Excel now" UI action, even when no field was changed.
        """
        with self._write_guard():
            snapshot_df = self.load_snapshot(snapshot_date, create_if_missing=create_if_missing)
            self.save_snapshot(snapshot_date, snapshot_df)
            return {
                "date": snapshot_date.isoformat(),
                "rows_saved": int(len(snapshot_df.index)),
                "snapshot_key": self._snapshot_key(snapshot_date),
            }

    def delete_snapshot_for_date(self, snapshot_date: date) -> dict:
        """Delete one daily workbook and any leftover legacy events file for the same date."""
        with self._write_guard():
            snapshot_key = self._snapshot_key(snapshot_date)
            legacy_events_key = self._legacy_location_events_key(snapshot_date)

            snapshot_exists = self.storage.exists(snapshot_key)
            legacy_events_exists = self.storage.exists(legacy_events_key)
            if not snapshot_exists and not legacy_events_exists:
                raise NotFoundError(f"Snapshot does not exist for date {snapshot_date.isoformat()}")

            snapshot_events_existed = False
            if snapshot_exists:
                try:
                    _, snapshot_events_df, has_events_sheet = self._load_daily_workbook(snapshot_date)
                    snapshot_events_existed = bool(has_events_sheet and not snapshot_events_df.empty)
                except Exception:  # noqa: BLE001
                    logger.warning(
                        "Could not inspect location events before deleting snapshot %s",
                        snapshot_date.isoformat(),
                    )

            snapshot_deleted = self.storage.delete(snapshot_key) if snapshot_exists else False
            legacy_events_deleted = (
                self.storage.delete(legacy_events_key) if legacy_events_exists else False
            )
            snapshot_events_deleted = bool(snapshot_deleted and snapshot_events_existed)
            events_existed = bool(snapshot_events_existed or legacy_events_exists)
            events_deleted = bool(snapshot_events_deleted or legacy_events_deleted)

            return {
                "date": snapshot_date.isoformat(),
                "snapshot_deleted": bool(snapshot_deleted),
                "events_existed": bool(events_existed),
                "snapshot_events_existed": bool(snapshot_events_existed),
                "legacy_events_existed": bool(legacy_events_exists),
                "events_deleted": bool(events_deleted),
                "snapshot_events_deleted": bool(snapshot_events_deleted),
                "snapshot_key": snapshot_key,
                "events_key": f"{snapshot_key}#{DAILY_LOCATION_EVENTS_SHEET}",
                "legacy_events_key": legacy_events_key,
                "legacy_events_deleted": bool(legacy_events_deleted),
            }

    def migrate_legacy_location_events(self) -> dict:
        """
        Migrate legacy `<snapshots_prefix>_events/YYYY-MM-DD.xlsx` files into daily snapshot workbook sheets.

        Legacy files are deleted only after successful merge into the same-day workbook.
        """
        with self._write_guard():
            legacy_prefix = self._legacy_location_events_prefix()
            legacy_keys = sorted(
                key
                for key in self.storage.list_keys(f"{legacy_prefix}/")
                if key.lower().endswith(".xlsx")
            )
            if not legacy_keys:
                return {"migrated_count": 0, "migrated_dates": [], "skipped_keys": []}

            migrated_dates: list[str] = []
            skipped_keys: list[str] = []

            for legacy_key in legacy_keys:
                filename = Path(legacy_key).name
                date_part = filename.removesuffix(".xlsx")
                try:
                    snapshot_date = date.fromisoformat(date_part)
                except ValueError:
                    skipped_keys.append(legacy_key)
                    logger.warning("Skipping legacy events file with invalid date format: %s", legacy_key)
                    continue

                snapshot_key = self._snapshot_key(snapshot_date)
                if not self.storage.exists(snapshot_key):
                    skipped_keys.append(legacy_key)
                    logger.warning(
                        "Skipping legacy events migration for %s because snapshot file is missing (%s)",
                        snapshot_date.isoformat(),
                        snapshot_key,
                    )
                    continue

                snapshot_df = self.load_snapshot(snapshot_date, create_if_missing=False)
                current_events_df = self._load_location_events_from_snapshot_sheet(snapshot_date)
                legacy_events_df = self._normalize_location_events_df(
                    self._read_excel(legacy_key),
                    snapshot_date,
                )

                combined_events_df = pd.concat(
                    [current_events_df, legacy_events_df],
                    ignore_index=True,
                )
                combined_events_df = self._normalize_location_events_df(
                    combined_events_df,
                    snapshot_date,
                )
                self._write_daily_workbook(snapshot_date, snapshot_df, combined_events_df)
                self.storage.delete(legacy_key)
                migrated_dates.append(snapshot_date.isoformat())

            if migrated_dates:
                logger.info(
                    "Migrated %s legacy events files into daily workbook format",
                    len(migrated_dates),
                )
            return {
                "migrated_count": len(migrated_dates),
                "migrated_dates": migrated_dates,
                "skipped_keys": skipped_keys,
            }

    def get_person_location_events(
        self,
        person_id: str,
        snapshot_date: date,
        *,
        create_if_missing: bool = True,
        include_voided: bool = True,
    ) -> dict:
        """Return one person's location tracking events for a specific date."""
        snapshot_df = self.load_snapshot(snapshot_date, create_if_missing=create_if_missing)
        self._validate_person_exists(snapshot_df, person_id)
        return self._build_person_location_events_payload(
            person_id,
            snapshot_date,
            include_voided=include_voided,
        )

    def get_person_location_transitions(
        self,
        person_id: str,
        snapshot_date: date,
        *,
        create_if_missing: bool = True,
    ) -> dict:
        """Return one person's computed location transitions for a specific date."""
        snapshot_df = self.load_snapshot(snapshot_date, create_if_missing=create_if_missing)
        self._validate_person_exists(snapshot_df, person_id)
        transitions_df = self._build_transitions_df(snapshot_df, self.load_location_events(snapshot_date), snapshot_date)
        person_transitions = transitions_df[transitions_df["person_id"] == person_id].copy()
        transition_records = [
            self._transition_row_to_record(row)
            for _, row in self._sort_transitions_df(person_transitions, descending=True).iterrows()
        ]
        return {
            "date": snapshot_date,
            "person_id": person_id,
            "transitions": transition_records,
        }

    def add_location_event_today(
        self,
        person_id: str,
        *,
        location: str,
        daily_status: str | None = None,
        occurred_at: str | None = None,
        source: str = DEFAULT_EVENT_SOURCE,
    ) -> dict:
        """Append one location event for today and sync today's snapshot current state."""
        with self._write_guard():
            today = date.today()
            snapshot_df = self.load_snapshot(today, create_if_missing=True)
            row_index = self._find_person_row_index(snapshot_df, person_id)
            events_df = self.load_location_events(today)

            normalized_location = self._normalize_location_option(location)
            if not normalized_location:
                raise ValidationError("location cannot be empty")
            if len(normalized_location) > MAX_LOCATION_LENGTH:
                raise ValidationError(f"location must be at most {MAX_LOCATION_LENGTH} characters")
            self._validate_location_allowed(normalized_location, field_name="location")

            status_value = self._normalize_daily_status(
                daily_status if daily_status is not None else snapshot_df.at[row_index, "daily_status"]
            )
            occurred_at_value = self._normalize_optional_event_timestamp(
                occurred_at,
                field_name="occurred_at",
            )

            previous_move_event = self._get_latest_active_move_event_for_person(events_df, person_id)

            created_event, events_df = self._append_location_event(
                events_df=events_df,
                snapshot_date=today,
                person_id=person_id,
                full_name=str(snapshot_df.at[row_index, "full_name"]),
                event_type="move",
                location=normalized_location,
                daily_status=status_value,
                occurred_at=occurred_at_value,
                source=source,
            )

            self._apply_current_state_from_events(snapshot_df, row_index, person_id, events_df)
            snapshot_df = self._normalize_snapshot_df(snapshot_df, today)
            self._persist_daily_workbook(today, snapshot_df, events_df)

            warning = self._build_transition_warning(previous_move_event, created_event)
            return self._build_person_location_events_payload(
                person_id,
                today,
                events_df=events_df,
                include_voided=True,
                last_action_event_id=str(created_event["event_id"]),
                last_action_type="move",
                latest_transition_warning=warning,
            )

    def delete_location_event_today(
        self,
        person_id: str,
        event_id: str,
        *,
        reason: str = "correction",
    ) -> dict:
        """Hard-delete one location event for today and recalculate current snapshot state."""
        with self._write_guard():
            normalized_event_id = str(event_id).strip()
            if not normalized_event_id:
                raise ValidationError("event_id cannot be empty")
            # Backward compatibility: API still accepts `reason`, but deletion is physical.
            _ = reason

            today = date.today()
            snapshot_df = self.load_snapshot(today, create_if_missing=True)
            row_index = self._find_person_row_index(snapshot_df, person_id)

            events_df = self.load_location_events(today)
            events_df = self._normalize_location_events_df(events_df, today)
            target_matches = events_df.index[
                (events_df["person_id"] == person_id)
                & (events_df["event_id"] == normalized_event_id)
            ].tolist()
            if not target_matches:
                raise NotFoundError(
                    f"Location event '{normalized_event_id}' was not found for person '{person_id}'"
                )

            target_index = target_matches[0]
            target_event = events_df.loc[target_index]
            target_event_type = self._normalize_event_type(target_event.get("event_type"))
            if target_event_type != "move":
                raise ValidationError("Only 'move' events can be deleted")

            # Remove the selected move event completely.
            removed_ids = {normalized_event_id}
            # Cleanup legacy append-only metadata rows if they exist.
            target_voided_by = str(target_event.get("voided_by_event_id") or "").strip()
            if target_voided_by:
                removed_ids.add(target_voided_by)

            legacy_targeting_rows = events_df[
                (events_df["target_event_id"] == normalized_event_id)
                & (events_df["event_type"].isin(["correction", "undo"]))
            ]
            removed_ids.update(legacy_targeting_rows["event_id"].astype(str).tolist())

            events_df = events_df[~events_df["event_id"].isin(removed_ids)].copy()
            events_df = self._normalize_location_events_df(events_df, today)

            self._apply_current_state_from_events(snapshot_df, row_index, person_id, events_df)
            snapshot_df = self._normalize_snapshot_df(snapshot_df, today)
            self._persist_daily_workbook(today, snapshot_df, events_df)

            return self._build_person_location_events_payload(
                person_id,
                today,
                events_df=events_df,
                include_voided=True,
            )

    def list_available_dates(self) -> list[date]:
        """List all snapshot dates currently available in storage."""
        prefix = self.settings.s3_snapshots_prefix.strip("/")
        keys = self.storage.list_keys(f"{prefix}/")

        dates: set[date] = set()
        for key in keys:
            if not key.endswith(".xlsx"):
                continue
            filename = Path(key).name
            date_part = filename.removesuffix(".xlsx")
            try:
                dates.add(date.fromisoformat(date_part))
            except ValueError:
                logger.debug("Skipping non-date snapshot key: %s", key)

        return sorted(dates)

    def get_snapshot_excel_bytes(
        self,
        snapshot_date: date,
        create_if_missing: bool = False,
    ) -> tuple[str, bytes]:
        """Return one daily snapshot as raw Excel bytes."""
        if create_if_missing:
            self.ensure_snapshot_for_date(snapshot_date)

        snapshot_key = self._snapshot_key(snapshot_date)
        if not self.storage.exists(snapshot_key):
            raise NotFoundError(f"Snapshot does not exist for date {snapshot_date.isoformat()}")

        snapshot_df = self.load_snapshot(snapshot_date, create_if_missing=False)
        events_df = self.load_location_events(snapshot_date)
        content = self._build_export_excel_bytes(snapshot_df, events_df, snapshot_date)
        filename = f"{snapshot_date.isoformat()}.xlsx"
        return filename, content

    def get_snapshots_zip_bytes(self, date_from: date, date_to: date) -> tuple[str, bytes]:
        """Return zip bytes containing all existing daily snapshots in a date range."""
        if date_from > date_to:
            raise ValidationError("date_from must be earlier than or equal to date_to")

        matching_dates = [
            item for item in self.list_available_dates() if date_from <= item <= date_to
        ]
        if not matching_dates:
            raise NotFoundError("No snapshot files were found in the selected date range")

        zip_buffer = BytesIO()
        added_files = 0
        with ZipFile(zip_buffer, mode="w", compression=ZIP_DEFLATED) as zip_file:
            for snapshot_date in matching_dates:
                snapshot_key = self._snapshot_key(snapshot_date)
                if not self.storage.exists(snapshot_key):
                    continue

                snapshot_df = self.load_snapshot(snapshot_date, create_if_missing=False)
                events_df = self.load_location_events(snapshot_date)
                snapshot_content = self._build_export_excel_bytes(
                    snapshot_df,
                    events_df,
                    snapshot_date,
                )
                zip_file.writestr(f"{snapshot_date.isoformat()}.xlsx", snapshot_content)
                added_files += 1

        if added_files == 0:
            raise NotFoundError("No snapshot files were found in the selected date range")

        filename = f"snapshots_{date_from.isoformat()}_to_{date_to.isoformat()}.zip"
        return filename, zip_buffer.getvalue()

    def get_locations(self) -> list[str]:
        """Return all available location options from locations Excel file."""
        locations_df = self.ensure_locations_file()
        return locations_df["location"].tolist()

    def add_location(self, location_name: str) -> list[str]:
        """Insert a new location option into locations Excel file."""
        with self._write_guard():
            normalized_name = self._normalize_location_option(location_name)
            if not normalized_name:
                raise ValidationError("Location name cannot be empty")

            locations_df = self.ensure_locations_file()
            existing = set(locations_df["location"].tolist())
            if normalized_name in existing:
                return locations_df["location"].tolist()

            new_row = {
                "location": normalized_name,
                "created_at": self._now_iso(),
            }
            updated_df = pd.concat(
                [locations_df, pd.DataFrame([new_row], columns=LOCATION_COLUMNS)],
                ignore_index=True,
            )
            self.save_locations(updated_df)
            return self.load_locations()["location"].tolist()

    def delete_location(self, location_name: str) -> list[str]:
        """Delete one location option from locations Excel file."""
        with self._write_guard():
            normalized_name = self._normalize_location_option(location_name)
            if not normalized_name:
                raise ValidationError("Location name cannot be empty")

            if normalized_name == DEFAULT_LOCATION:
                raise ValidationError(f"Cannot delete required default location: {DEFAULT_LOCATION}")

            locations_df = self.ensure_locations_file()
            existing = set(locations_df["location"].tolist())
            if normalized_name not in existing:
                raise NotFoundError(f"Location '{normalized_name}' was not found")

            # Prevent deleting a location that is currently in active use.
            today_df = self.load_snapshot(date.today(), create_if_missing=True)
            in_use_rows = today_df[
                (today_df["location"] == normalized_name)
                | (today_df["self_location"] == normalized_name)
            ]
            if not in_use_rows.empty:
                sample_names = ", ".join(
                    in_use_rows["full_name"].astype(str).head(5).tolist()
                )
                raise ValidationError(
                    "Cannot delete location that is currently in use. "
                    f"Example people: {sample_names}"
                )

            today_events_df = self.load_location_events(date.today())
            in_use_events = today_events_df[
                (today_events_df["location"] == normalized_name)
                & (today_events_df["event_type"] == "move")
                & (~today_events_df["is_voided"].map(self._parse_bool))
            ]
            if not in_use_events.empty:
                people_by_id = {
                    str(row["person_id"]): str(row["full_name"])
                    for _, row in today_df.iterrows()
                }
                sample_names = ", ".join(
                    people_by_id.get(str(item), str(item))
                    for item in in_use_events["person_id"].astype(str).head(5).tolist()
                )
                raise ValidationError(
                    "Cannot delete location that exists in today's tracking events. "
                    f"Example people: {sample_names}"
                )

            updated_df = locations_df[locations_df["location"] != normalized_name].copy()
            self.save_locations(updated_df)
            return self.load_locations()["location"].tolist()

    def add_initial_people_today(self, names: list[str]) -> dict:
        """
        Add missing people from one initial names list.

        The method saves names to master list and inserts them into today's snapshot,
        so future dates are automatically generated with the same people.
        """
        with self._write_guard():
            normalized_names = self._normalize_initial_names(names)
            if not normalized_names:
                raise ValidationError("At least one valid full name is required")

            master_df = self.load_master_people()
            today = date.today()
            snapshot_df = self.load_snapshot(today, create_if_missing=True)

            existing_master_keys = {
                self._normalize_name_key(item)
                for item in master_df["full_name"].astype(str).tolist()
            }
            existing_ids = set(master_df["person_id"].astype(str).tolist())

            created_names: list[str] = []
            skipped_names: list[str] = []
            new_master_rows: list[dict] = []
            new_snapshot_rows: list[dict] = []
            now_value = self._now_iso()

            for full_name in normalized_names:
                full_name_key = self._normalize_name_key(full_name)
                if full_name_key in existing_master_keys:
                    skipped_names.append(full_name)
                    continue

                person_id = self._generate_person_id(existing_ids)
                existing_ids.add(person_id)
                existing_master_keys.add(full_name_key)
                created_names.append(full_name)

                new_master_rows.append(
                    {
                        "person_id": person_id,
                        "full_name": full_name,
                    }
                )
                new_snapshot_rows.append(
                    self._build_snapshot_row(
                        person_id=person_id,
                        full_name=full_name,
                        snapshot_date=today,
                        location=DEFAULT_LOCATION,
                        daily_status=DEFAULT_DAILY_STATUS,
                        self_location="",
                        self_daily_status="",
                        notes="",
                        last_updated=now_value,
                    )
                )

            if new_master_rows:
                master_df = pd.concat(
                    [master_df, pd.DataFrame(new_master_rows, columns=MASTER_COLUMNS)],
                    ignore_index=True,
                )
                self.save_master_people(master_df)

            if new_snapshot_rows:
                snapshot_df = pd.concat(
                    [snapshot_df, pd.DataFrame(new_snapshot_rows, columns=SNAPSHOT_COLUMNS)],
                    ignore_index=True,
                )
                snapshot_df = self._normalize_snapshot_df(snapshot_df, today)
                self.save_snapshot(today, snapshot_df)

            return {
                "created_count": len(created_names),
                "skipped_count": len(skipped_names),
                "created_names": created_names,
                "skipped_names": skipped_names,
            }

    def add_person_today(self, payload: PersonCreate) -> dict:
        """Add a person to master list and today's snapshot."""
        with self._write_guard():
            master_df = self.load_master_people()
            existing_ids = set(master_df["person_id"].tolist())
            location_value = self._normalize_location_option(payload.location)
            if not location_value:
                raise ValidationError("location cannot be empty")
            self._validate_location_allowed(location_value, field_name="location")

            new_person_id = self._generate_person_id(existing_ids)
            master_df = pd.concat(
                [
                    master_df,
                    pd.DataFrame(
                        [{"person_id": new_person_id, "full_name": payload.full_name.strip()}],
                        columns=MASTER_COLUMNS,
                    ),
                ],
                ignore_index=True,
            )
            self.save_master_people(master_df)

            today = date.today()
            snapshot_df = self.load_snapshot(today, create_if_missing=True)

            new_row = self._build_snapshot_row(
                person_id=new_person_id,
                full_name=payload.full_name.strip(),
                snapshot_date=today,
                location=location_value,
                daily_status=payload.daily_status,
                self_location="",
                self_daily_status="",
                notes=payload.notes,
            )
            snapshot_df = pd.concat([snapshot_df, pd.DataFrame([new_row], columns=SNAPSHOT_COLUMNS)], ignore_index=True)
            snapshot_df = self._normalize_snapshot_df(snapshot_df, today)
            self.save_snapshot(today, snapshot_df)

            return self._row_to_record(snapshot_df.loc[snapshot_df["person_id"] == new_person_id].iloc[0])

    def update_person_today(self, person_id: str, payload: PersonUpdate) -> dict:
        """Apply partial updates to one person in today's snapshot."""
        patch = payload.model_dump(exclude_unset=True)
        if not patch:
            raise ValidationError("No fields were provided for update")

        with self._write_guard():
            today = date.today()
            snapshot_df = self.load_snapshot(today, create_if_missing=True)
            matches = snapshot_df.index[snapshot_df["person_id"] == person_id].tolist()
            if not matches:
                raise NotFoundError(f"Person '{person_id}' was not found in today's snapshot")

            row_index = matches[0]
            previous_location = self._normalize_location(snapshot_df.at[row_index, "location"])
            previous_daily_status = self._normalize_daily_status(snapshot_df.at[row_index, "daily_status"])
            for field_name, field_value in patch.items():
                if field_value is not None:
                    if field_name == "location":
                        normalized_location = self._normalize_location_option(field_value)
                        if not normalized_location:
                            raise ValidationError("location cannot be empty")
                        self._validate_location_allowed(
                            normalized_location,
                            field_name="location",
                        )
                        snapshot_df.at[row_index, field_name] = normalized_location
                        continue

                    if field_name == "self_location":
                        normalized_self_location = self._normalize_location_option(field_value)
                        if not normalized_self_location:
                            raise ValidationError("self_location cannot be empty")
                        self._validate_location_allowed(
                            normalized_self_location,
                            field_name="self_location",
                        )
                        snapshot_df.at[row_index, field_name] = normalized_self_location
                        continue

                    snapshot_df.at[row_index, field_name] = field_value

            next_location = self._normalize_location(snapshot_df.at[row_index, "location"])
            next_daily_status = self._normalize_daily_status(snapshot_df.at[row_index, "daily_status"])
            events_df_for_save: pd.DataFrame | None = None
            should_append_tracking_event = (
                next_location != previous_location
                or next_daily_status != previous_daily_status
            )
            if should_append_tracking_event:
                events_df = self.load_location_events(today)
                _, events_df_for_save = self._append_location_event(
                    events_df=events_df,
                    snapshot_date=today,
                    person_id=person_id,
                    full_name=str(snapshot_df.at[row_index, "full_name"]),
                    event_type="move",
                    location=next_location,
                    daily_status=next_daily_status,
                    occurred_at=self._now_iso_precise(),
                    source="quick_update",
                )

            snapshot_df.at[row_index, "last_updated"] = self._now_iso()
            snapshot_df = self._normalize_snapshot_df(snapshot_df, today)
            if events_df_for_save is not None:
                self._persist_daily_workbook(today, snapshot_df, events_df_for_save)
            else:
                self.save_snapshot(today, snapshot_df)

            # Name changes are persisted in master list so new snapshots will include the updated name.
            if patch.get("full_name"):
                self._update_master_name(person_id, patch["full_name"])

            updated_row = snapshot_df.loc[snapshot_df["person_id"] == person_id].iloc[0]
            return self._row_to_record(updated_row)

    def update_self_report_today(
        self,
        person_lookup: str,
        self_location: str,
        self_daily_status: str,
        *,
        source: str = "self_report_bot",
    ) -> dict:
        """
        Update self-reported location and status for today's snapshot.

        person_lookup supports either:
        - exact `person_id` value
        - exact `full_name` (case-insensitive)
        """
        with self._write_guard():
            today = date.today()
            snapshot_df = self.load_snapshot(today, create_if_missing=True)
            row_index = self._find_row_index_for_lookup(snapshot_df, person_lookup)
            person_id = str(snapshot_df.at[row_index, "person_id"])

            location_value = self._normalize_location_option(self_location)
            if not location_value:
                raise ValidationError("self_location cannot be empty")
            if len(location_value) > MAX_LOCATION_LENGTH:
                raise ValidationError(
                    f"self_location must be at most {MAX_LOCATION_LENGTH} characters"
                )
            self._validate_location_allowed(location_value, field_name="self_location")

            status_value = self._normalize_required_daily_status(self_daily_status)
            snapshot_df.at[row_index, "self_location"] = location_value
            snapshot_df.at[row_index, "self_daily_status"] = status_value
            events_df = self.load_location_events(today)
            _, events_df = self._append_location_event(
                events_df=events_df,
                snapshot_date=today,
                person_id=person_id,
                full_name=str(snapshot_df.at[row_index, "full_name"]),
                event_type="move",
                location=location_value,
                daily_status=status_value,
                occurred_at=self._now_iso_precise(),
                source=source,
            )
            self._apply_current_state_from_events(snapshot_df, row_index, person_id, events_df)
            snapshot_df.at[row_index, "last_updated"] = self._now_iso()

            snapshot_df = self._normalize_snapshot_df(snapshot_df, today)
            self._persist_daily_workbook(today, snapshot_df, events_df)

            updated_row = snapshot_df.loc[snapshot_df["person_id"] == person_id].iloc[0]
            return self._row_to_record(updated_row)

    def replace_person_today(self, person_id: str, payload: PersonCreate) -> dict:
        """Replace editable fields for a person in today's snapshot."""
        full_payload = PersonUpdate(
            full_name=payload.full_name,
            location=payload.location,
            daily_status=payload.daily_status,
            notes=payload.notes,
        )
        return self.update_person_today(person_id, full_payload)

    def delete_person_today(self, person_id: str) -> dict:
        """Delete person from today's snapshot and from master list."""
        with self._write_guard():
            today = date.today()
            snapshot_df = self.load_snapshot(today, create_if_missing=True)
            matches = snapshot_df.index[snapshot_df["person_id"] == person_id].tolist()
            if not matches:
                raise NotFoundError(f"Person '{person_id}' was not found in today's snapshot")

            deleted_row = snapshot_df.loc[matches[0]].copy()
            snapshot_df = snapshot_df[snapshot_df["person_id"] != person_id].copy()
            events_df = self.load_location_events(today)
            events_df = events_df[events_df["person_id"] != person_id].copy()
            snapshot_df = self._normalize_snapshot_df(snapshot_df, today)
            self._persist_daily_workbook(today, snapshot_df, events_df)

            master_df = self.load_master_people()
            master_df = master_df[master_df["person_id"] != person_id].copy()
            self.save_master_people(master_df)

            return self._row_to_record(deleted_row)

    def restore_snapshot_to_today(self, source_date: date) -> dict:
        """Restore a historical snapshot into today's snapshot file."""
        with self._write_guard():
            today = date.today()
            if source_date == today:
                return self.get_snapshot_for_date(today, create_if_missing=True)

            source_df = self.load_snapshot(source_date, create_if_missing=False)
            restore_policy = self.settings.snapshot_restore_policy

            if restore_policy == "exact_snapshot":
                # Restore exactly as historical day, including people removed from current master.
                restored_df = self._build_snapshot_from_source_exact(source_df, today)
            else:
                # Restore only people currently active in master list.
                master_df = self.load_master_people()
                restored_df = self._build_snapshot_from_master(
                    master_df,
                    source_df,
                    today,
                    carry_policy=SnapshotCarryPolicy(
                        carry_location=True,
                        carry_daily_status=True,
                        carry_notes=True,
                        carry_self_report=True,
                    ),
                )
            self._persist_daily_workbook(
                today,
                restored_df,
                pd.DataFrame(columns=LOCATION_EVENT_COLUMNS),
            )
            logger.info(
                "Restored snapshot from %s into %s (policy=%s)",
                source_date.isoformat(),
                today.isoformat(),
                restore_policy,
            )
            return self.get_snapshot_for_date(today, create_if_missing=False)

    def ensure_snapshot_for_date(self, snapshot_date: date) -> pd.DataFrame:
        """Ensure a snapshot file exists for the given date, then return it."""
        with self._write_guard():
            snapshot_key = self._snapshot_key(snapshot_date)
            if self.storage.exists(snapshot_key):
                existing_snapshot_df, existing_events_df, _ = self._load_daily_workbook(snapshot_date)
                if self._should_rebuild_empty_snapshot_from_master(
                    existing_snapshot_df,
                    existing_events_df,
                ):
                    master_df = self.ensure_master_people()
                    if not master_df.empty:
                        logger.warning(
                            "Detected empty snapshot for %s with non-empty master; rebuilding from master",
                            snapshot_date.isoformat(),
                        )
                        rebuilt_snapshot = self._build_snapshot_from_master(
                            master_df,
                            None,
                            snapshot_date,
                            carry_policy=SnapshotCarryPolicy(
                                carry_location=False,
                                carry_daily_status=False,
                                carry_notes=False,
                                carry_self_report=False,
                            ),
                        )
                        self._write_daily_workbook(snapshot_date, rebuilt_snapshot, existing_events_df)
                        self._delete_legacy_location_events_file(snapshot_date)
                        return rebuilt_snapshot
                return existing_snapshot_df

            master_df = self.ensure_master_people()

            # New working file is always bootstrapped from master people list only.
            logger.info("Creating %s snapshot from master people list", snapshot_date)
            new_snapshot = self._build_snapshot_from_master(
                master_df,
                None,
                snapshot_date,
                carry_policy=SnapshotCarryPolicy(
                    carry_location=False,
                    carry_daily_status=False,
                    carry_notes=False,
                    carry_self_report=False,
                ),
            )

            self.save_snapshot(snapshot_date, new_snapshot)
            return new_snapshot

    def load_snapshot(self, snapshot_date: date, create_if_missing: bool = False) -> pd.DataFrame:
        """Load and normalize one date snapshot from storage."""
        if create_if_missing:
            # Route through ensure flow so existing files can be auto-repaired when safe.
            return self.ensure_snapshot_for_date(snapshot_date)

        snapshot_key = self._snapshot_key(snapshot_date)
        if not self.storage.exists(snapshot_key):
            raise NotFoundError(f"Snapshot does not exist for date {snapshot_date.isoformat()}")

        snapshot_df, _, _ = self._load_daily_workbook(snapshot_date)
        return snapshot_df

    def save_snapshot(self, snapshot_date: date, df: pd.DataFrame) -> None:
        """Normalize and persist one date snapshot, preserving same-day location-events sheet."""
        clean_snapshot_df = self._normalize_snapshot_df(df, snapshot_date)
        with self._write_guard():
            events_df = self.load_location_events(snapshot_date)
            self._persist_daily_workbook(snapshot_date, clean_snapshot_df, events_df)

    def load_location_events(self, snapshot_date: date) -> pd.DataFrame:
        """
        Load and normalize one date location-events data.

        Primary source is the `location_events` sheet inside the same daily snapshot workbook.
        For backward compatibility, legacy `<snapshots_prefix>_events/YYYY-MM-DD.xlsx` is used
        only when snapshot workbook does not yet contain a `location_events` sheet.
        """
        snapshot_key = self._snapshot_key(snapshot_date)
        if self.storage.exists(snapshot_key):
            _, events_df, has_events_sheet = self._load_daily_workbook(snapshot_date)
            if has_events_sheet:
                return events_df

        legacy_key = self._legacy_location_events_key(snapshot_date)
        if self.storage.exists(legacy_key):
            legacy_df = self._read_excel(legacy_key)
            return self._normalize_location_events_df(legacy_df, snapshot_date)

        return pd.DataFrame(columns=LOCATION_EVENT_COLUMNS)

    def save_location_events(self, snapshot_date: date, df: pd.DataFrame) -> None:
        """Normalize and persist one date location-events sheet inside daily snapshot workbook."""
        clean_events_df = self._normalize_location_events_df(df, snapshot_date)
        with self._write_guard():
            snapshot_df = self.load_snapshot(snapshot_date, create_if_missing=True)
            self._persist_daily_workbook(snapshot_date, snapshot_df, clean_events_df)

    def ensure_master_people(self) -> pd.DataFrame:
        """Ensure master people file exists; bootstrap from seed if missing."""
        with self._write_guard():
            if self.storage.exists(self.settings.s3_master_key):
                return self.load_master_people()

            seed_path = self.settings.seed_people_file
            if not seed_path.exists():
                raise ValidationError(f"Seed people file was not found: {seed_path}")

            seed_df = self._read_seed_people_file(seed_path)
            master_df = self._normalize_master_df(seed_df)
            self.save_master_people(master_df)
            logger.info("Created master people file from seed data")
            return master_df

    def load_master_people(self) -> pd.DataFrame:
        """Load and normalize master people list."""
        if not self.storage.exists(self.settings.s3_master_key):
            return self.ensure_master_people()

        df = self._read_excel(self.settings.s3_master_key)
        return self._normalize_master_df(df)

    def save_master_people(self, df: pd.DataFrame) -> None:
        """Normalize and persist master people list."""
        clean_df = self._normalize_master_df(df)
        content = self._to_excel_bytes(clean_df)
        with self._write_guard():
            self.storage.write_bytes(self.settings.s3_master_key, content)

    def ensure_locations_file(self) -> pd.DataFrame:
        """Ensure locations file exists; create it with defaults if missing."""
        with self._write_guard():
            if self.storage.exists(self.settings.s3_locations_key):
                return self.load_locations()

            default_rows = [
                {"location": name, "created_at": self._now_iso()}
                for name in DEFAULT_LOCATION_OPTIONS
            ]
            default_df = pd.DataFrame(default_rows, columns=LOCATION_COLUMNS)
            self.save_locations(default_df)
            return default_df

    def load_locations(self) -> pd.DataFrame:
        """Load and normalize locations list from Excel file."""
        if not self.storage.exists(self.settings.s3_locations_key):
            return self.ensure_locations_file()

        df = self._read_excel(self.settings.s3_locations_key)
        return self._normalize_locations_df(df)

    def save_locations(self, df: pd.DataFrame) -> None:
        """Normalize and persist locations list Excel file."""
        clean_df = self._normalize_locations_df(df)
        content = self._to_excel_bytes(clean_df)
        with self._write_guard():
            self.storage.write_bytes(self.settings.s3_locations_key, content)

    def _update_master_name(self, person_id: str, full_name: str) -> None:
        """Sync updated name from snapshot back into master list."""
        master_df = self.load_master_people()
        matches = master_df.index[master_df["person_id"] == person_id].tolist()
        if not matches:
            return

        master_df.at[matches[0], "full_name"] = full_name.strip()
        self.save_master_people(master_df)

    def _build_snapshot_row(
        self,
        *,
        person_id: str,
        full_name: str,
        snapshot_date: date,
        location: str,
        daily_status: str,
        self_location: str = "",
        self_daily_status: str = "",
        notes: str = "",
        last_updated: str | None = None,
    ) -> dict:
        """Build one normalized snapshot row dictionary."""
        return {
            "person_id": person_id,
            "full_name": full_name.strip(),
            "location": location,
            "daily_status": daily_status,
            "self_location": self_location,
            "self_daily_status": self_daily_status,
            "notes": notes,
            "last_updated": last_updated or self._now_iso(),
            "date": snapshot_date.isoformat(),
        }

    def _build_snapshot_from_source_exact(self, source_df: pd.DataFrame, snapshot_date: date) -> pd.DataFrame:
        """
        Build restored snapshot by cloning historical rows as-is.

        This policy preserves exactly the people that existed on source date,
        including people currently missing from master list.
        """
        source_copy = source_df.copy()
        return self._normalize_snapshot_df(source_copy, snapshot_date)

    def _build_snapshot_from_master(
        self,
        master_df: pd.DataFrame,
        source_df: pd.DataFrame | None,
        snapshot_date: date,
        carry_policy: SnapshotCarryPolicy,
    ) -> pd.DataFrame:
        """
        Create a full-day snapshot from master list and optional source snapshot.

        For day rollover we copy only the people list and reset daily fields to defaults.
        For restore flows we can copy fields from historical source using carry_policy.
        New daily files intentionally start with defaults so each day is a fresh XLSX.
        """
        source_by_id = {}
        if source_df is not None and not source_df.empty:
            source_df = self._normalize_snapshot_df(source_df, snapshot_date)
            source_by_id = {
                row["person_id"]: row for _, row in source_df.drop_duplicates(subset=["person_id"], keep="last").iterrows()
            }

        rows: list[dict] = []
        now_value = self._now_iso()
        for _, person in master_df.iterrows():
            person_id = str(person["person_id"])
            source_row = source_by_id.get(person_id)

            # Every daily file is a full snapshot, so each master person must exist once.
            rows.append(
                self._build_snapshot_row(
                    person_id=person_id,
                    full_name=str(person["full_name"]).strip(),
                    snapshot_date=snapshot_date,
                    location=self._normalize_location(
                        source_row["location"]
                        if (carry_policy.carry_location and source_row is not None)
                        else DEFAULT_LOCATION
                    ),
                    daily_status=self._normalize_daily_status(
                        source_row["daily_status"]
                        if (carry_policy.carry_daily_status and source_row is not None)
                        else DEFAULT_DAILY_STATUS
                    ),
                    # Self-report fields are reset for a new day unless explicitly restored from history.
                    self_location=self._normalize_self_location(
                        source_row["self_location"]
                        if (carry_policy.carry_self_report and source_row is not None)
                        else ""
                    ),
                    self_daily_status=self._normalize_self_daily_status(
                        source_row["self_daily_status"]
                        if (carry_policy.carry_self_report and source_row is not None)
                        else ""
                    ),
                    notes=self._normalize_notes(
                        source_row["notes"]
                        if (carry_policy.carry_notes and source_row is not None)
                        else ""
                    ),
                    last_updated=now_value,
                )
            )

        output = pd.DataFrame(rows, columns=SNAPSHOT_COLUMNS)
        return self._normalize_snapshot_df(output, snapshot_date)

    def _normalize_master_df(self, df: pd.DataFrame) -> pd.DataFrame:
        """Validate and normalize master people dataframe structure."""
        if "full_name" not in df.columns:
            raise ValidationError("Master people data must include 'full_name' column")

        normalized = df.copy()
        if "person_id" not in normalized.columns:
            normalized["person_id"] = ""

        normalized["full_name"] = normalized["full_name"].astype(str).map(lambda x: x.strip())
        normalized = normalized[normalized["full_name"] != ""].copy()
        if normalized.empty:
            return pd.DataFrame(columns=MASTER_COLUMNS)

        normalized["person_id"] = self._normalize_person_ids(normalized["person_id"].tolist())
        normalized = normalized.drop_duplicates(subset=["person_id"], keep="last")
        normalized = normalized[MASTER_COLUMNS].sort_values("full_name", kind="stable").reset_index(drop=True)
        return normalized

    def _normalize_locations_df(self, df: pd.DataFrame) -> pd.DataFrame:
        """Validate and normalize locations dataframe structure."""
        normalized = df.copy() if df is not None else pd.DataFrame()

        for column in LOCATION_COLUMNS:
            if column not in normalized.columns:
                normalized[column] = ""

        normalized = normalized[LOCATION_COLUMNS].copy()
        normalized["location"] = normalized["location"].map(self._normalize_location_option)
        normalized["created_at"] = normalized["created_at"].map(self._normalize_timestamp)
        normalized = normalized[normalized["location"].notna()].copy()
        normalized = normalized.drop_duplicates(subset=["location"], keep="first")

        if normalized.empty:
            default_rows = [
                {"location": name, "created_at": self._now_iso()}
                for name in DEFAULT_LOCATION_OPTIONS
            ]
            normalized = pd.DataFrame(default_rows, columns=LOCATION_COLUMNS)

        normalized = normalized.reset_index(drop=True)
        return normalized

    def _normalize_location_events_df(self, df: pd.DataFrame, snapshot_date: date) -> pd.DataFrame:
        """Validate and normalize one date location-events dataframe."""
        normalized = df.copy() if df is not None else pd.DataFrame()

        for column in LOCATION_EVENT_COLUMNS:
            if column not in normalized.columns:
                normalized[column] = ""

        normalized = normalized[LOCATION_EVENT_COLUMNS].copy()
        normalized["person_id"] = normalized["person_id"].astype(str).map(lambda x: x.strip())
        normalized = normalized[
            (normalized["person_id"] != "")
            & (normalized["person_id"].str.lower() != "nan")
        ].copy()
        normalized["full_name"] = normalized["full_name"].astype(str).map(
            lambda value: "" if value.strip().lower() == "nan" else value.strip()
        )

        normalized["event_type"] = normalized["event_type"].map(self._normalize_event_type)
        normalized["target_event_id"] = normalized["target_event_id"].astype(str).map(lambda x: x.strip() or "")
        normalized["is_voided"] = normalized["is_voided"].map(self._parse_bool)
        normalized["voided_at"] = normalized["voided_at"].map(self._normalize_nullable_event_timestamp)
        normalized["voided_by_event_id"] = normalized["voided_by_event_id"].astype(str).map(
            lambda x: x.strip() or ""
        )
        normalized["location"] = normalized["location"].map(self._normalize_location)
        normalized["daily_status"] = normalized["daily_status"].map(self._normalize_daily_status)
        normalized["occurred_at"] = normalized["occurred_at"].map(self._normalize_event_timestamp)
        normalized["created_at"] = normalized["created_at"].map(self._normalize_event_timestamp)
        normalized["source"] = normalized["source"].astype(str).map(
            lambda item: item.strip() or DEFAULT_EVENT_SOURCE
        )
        normalized["date"] = snapshot_date.isoformat()

        normalized["event_id"] = self._normalize_event_ids(normalized["event_id"].tolist())
        normalized = normalized.drop_duplicates(subset=["event_id"], keep="last")
        normalized = self._sort_location_events_df(normalized).reset_index(drop=True)
        return normalized

    def _with_location_event_full_names(
        self,
        events_df: pd.DataFrame,
        *,
        snapshot_df: pd.DataFrame,
        snapshot_date: date,
    ) -> pd.DataFrame:
        """
        Ensure each location-event row has `full_name`.

        Existing names are preserved; missing names are backfilled from snapshot person mapping.
        """
        normalized_events = self._normalize_location_events_df(events_df, snapshot_date)
        if normalized_events.empty:
            return normalized_events

        people_source = self._normalize_snapshot_df(snapshot_df, snapshot_date)
        full_name_by_id = {
            str(item["person_id"]): str(item["full_name"]).strip()
            for _, item in people_source.iterrows()
        }

        enriched = normalized_events.copy()
        if "full_name" not in enriched.columns:
            enriched["full_name"] = ""
        enriched["full_name"] = enriched["full_name"].astype(str).map(
            lambda item: "" if item.strip().lower() == "nan" else item.strip()
        )
        missing_mask = enriched["full_name"] == ""
        if missing_mask.any():
            enriched.loc[missing_mask, "full_name"] = (
                enriched.loc[missing_mask, "person_id"].astype(str).map(full_name_by_id).fillna("")
            )

        return self._normalize_location_events_df(enriched, snapshot_date)

    def _normalize_snapshot_df(self, df: pd.DataFrame, snapshot_date: date) -> pd.DataFrame:
        """Validate and normalize snapshot dataframe structure and values."""
        normalized = df.copy() if df is not None else pd.DataFrame()

        for column in SNAPSHOT_COLUMNS:
            if column not in normalized.columns:
                normalized[column] = ""

        normalized = normalized[SNAPSHOT_COLUMNS].copy()
        normalized["person_id"] = self._normalize_person_ids(normalized["person_id"].tolist())
        normalized["full_name"] = normalized["full_name"].astype(str).map(lambda x: x.strip() or "ללא שם")
        normalized["location"] = normalized["location"].map(self._normalize_location)
        normalized["daily_status"] = normalized["daily_status"].map(self._normalize_daily_status)
        normalized["self_location"] = normalized["self_location"].map(self._normalize_self_location)
        normalized["self_daily_status"] = normalized["self_daily_status"].map(self._normalize_self_daily_status)
        normalized["notes"] = normalized["notes"].map(self._normalize_notes)
        normalized["last_updated"] = normalized["last_updated"].map(self._normalize_timestamp)
        normalized["date"] = snapshot_date.isoformat()

        normalized = normalized.drop_duplicates(subset=["person_id"], keep="last")
        normalized = normalized.sort_values("full_name", kind="stable").reset_index(drop=True)
        return normalized

    def _normalize_person_ids(self, values: list[object]) -> list[str]:
        """Normalize IDs and generate missing/duplicate IDs."""
        seen: set[str] = set()
        normalized_ids: list[str] = []

        for raw in values:
            candidate = str(raw).strip() if raw is not None else ""
            if not candidate or candidate.lower() == "nan" or candidate in seen:
                candidate = self._generate_person_id(seen)
            while candidate in seen:
                candidate = self._generate_person_id(seen)

            seen.add(candidate)
            normalized_ids.append(candidate)

        return normalized_ids

    def _normalize_event_ids(self, values: list[object]) -> list[str]:
        """Normalize event IDs and generate missing/duplicate IDs."""
        seen: set[str] = set()
        normalized_ids: list[str] = []

        for raw in values:
            candidate = str(raw).strip() if raw is not None else ""
            if not candidate or candidate.lower() == "nan" or candidate in seen:
                candidate = self._generate_event_id(seen)
            while candidate in seen:
                candidate = self._generate_event_id(seen)

            seen.add(candidate)
            normalized_ids.append(candidate)

        return normalized_ids

    def _normalize_initial_names(self, names: list[str]) -> list[str]:
        """Normalize bulk names list, remove invalid/duplicate values, and preserve order."""
        normalized_names: list[str] = []
        seen: set[str] = set()
        for raw_name in names:
            cleaned_name = str(raw_name).strip()
            if len(cleaned_name) < 2:
                continue
            name_key = self._normalize_name_key(cleaned_name)
            if name_key in seen:
                continue
            seen.add(name_key)
            normalized_names.append(cleaned_name)
        return normalized_names

    def _should_rebuild_empty_snapshot_from_master(
        self,
        snapshot_df: pd.DataFrame,
        events_df: pd.DataFrame,
    ) -> bool:
        """
        Decide whether an existing date snapshot should be repaired from master list.

        Rebuild is considered safe only when both:
        - snapshot has zero people rows
        - there are no movement events for that date
        """
        if snapshot_df is None or not snapshot_df.empty:
            return False
        return events_df is None or events_df.empty

    def _normalize_name_key(self, name: object) -> str:
        """Normalize full-name text for case-insensitive comparisons."""
        return str(name).strip().lower()

    def _generate_person_id(self, used_ids: set[str]) -> str:
        """Generate a unique person identifier."""
        while True:
            candidate = f"P-{uuid4().hex[:8]}"
            if candidate not in used_ids:
                return candidate

    def _generate_event_id(self, used_ids: set[str]) -> str:
        """Generate a unique location-event identifier."""
        while True:
            candidate = f"E-{uuid4().hex[:10]}"
            if candidate not in used_ids:
                return candidate

    def _snapshot_key(self, snapshot_date: date) -> str:
        """Build storage key for snapshot file by date."""
        prefix = self.settings.s3_snapshots_prefix.strip("/")
        return f"{prefix}/{snapshot_date.isoformat()}.xlsx"

    def _legacy_location_events_prefix(self) -> str:
        """Build legacy location-events folder prefix used by older versions."""
        prefix = self.settings.s3_snapshots_prefix.strip("/")
        return f"{prefix}_events"

    def _legacy_location_events_key(self, snapshot_date: date) -> str:
        """Build storage key for one date legacy location-events workbook."""
        return f"{self._legacy_location_events_prefix()}/{snapshot_date.isoformat()}.xlsx"

    def _legacy_location_events_migration_marker_key(self) -> str:
        """Build storage key marker for one-time legacy events migration."""
        prefix = self.settings.s3_snapshots_prefix.strip("/")
        return f"{prefix}/_meta/legacy_location_events_migration_v1.done"

    def _load_daily_workbook(self, snapshot_date: date) -> tuple[pd.DataFrame, pd.DataFrame, bool]:
        """
        Load one daily workbook and return normalized snapshot/events dataframes.

        Returns:
        - snapshot dataframe
        - location-events dataframe
        - bool flag indicating whether the workbook already has `location_events` sheet
        """
        snapshot_key = self._snapshot_key(snapshot_date)
        workbook = self._read_excel_workbook(snapshot_key)

        if DAILY_SNAPSHOT_SHEET in workbook:
            snapshot_source_df = workbook[DAILY_SNAPSHOT_SHEET]
        elif workbook:
            # Backward compatibility for old single-sheet daily files.
            snapshot_source_df = next(iter(workbook.values()))
        else:
            snapshot_source_df = pd.DataFrame(columns=SNAPSHOT_COLUMNS)

        has_events_sheet = DAILY_LOCATION_EVENTS_SHEET in workbook
        events_source_df = (
            workbook[DAILY_LOCATION_EVENTS_SHEET]
            if has_events_sheet
            else pd.DataFrame(columns=LOCATION_EVENT_COLUMNS)
        )

        snapshot_df = self._normalize_snapshot_df(snapshot_source_df, snapshot_date)
        events_df = self._normalize_location_events_df(events_source_df, snapshot_date)
        return snapshot_df, events_df, has_events_sheet

    def _load_location_events_from_snapshot_sheet(self, snapshot_date: date) -> pd.DataFrame:
        """Load events only from snapshot workbook sheet (without legacy fallback)."""
        snapshot_key = self._snapshot_key(snapshot_date)
        if not self.storage.exists(snapshot_key):
            return pd.DataFrame(columns=LOCATION_EVENT_COLUMNS)

        _, events_df, has_events_sheet = self._load_daily_workbook(snapshot_date)
        if not has_events_sheet:
            return pd.DataFrame(columns=LOCATION_EVENT_COLUMNS)
        return events_df

    def _write_daily_workbook(
        self,
        snapshot_date: date,
        snapshot_df: pd.DataFrame,
        events_df: pd.DataFrame,
    ) -> None:
        """Persist snapshot + location-events into one daily workbook."""
        clean_snapshot_df = self._normalize_snapshot_df(snapshot_df, snapshot_date)
        clean_events_df = self._normalize_location_events_df(events_df, snapshot_date)
        clean_events_df = self._with_location_event_full_names(
            clean_events_df,
            snapshot_df=clean_snapshot_df,
            snapshot_date=snapshot_date,
        )
        content = self._to_daily_workbook_bytes(clean_snapshot_df, clean_events_df)
        self.storage.write_bytes(self._snapshot_key(snapshot_date), content)

    def _persist_daily_workbook(
        self,
        snapshot_date: date,
        snapshot_df: pd.DataFrame,
        events_df: pd.DataFrame,
    ) -> None:
        """Persist daily snapshot/events workbook and remove legacy sidecar events file."""
        self._write_daily_workbook(snapshot_date, snapshot_df, events_df)
        self._delete_legacy_location_events_file(snapshot_date)

    def _delete_legacy_location_events_file(self, snapshot_date: date) -> bool:
        """Delete one legacy events file when present (no-op when already absent)."""
        legacy_key = self._legacy_location_events_key(snapshot_date)
        if not self.storage.exists(legacy_key):
            return False
        return self.storage.delete(legacy_key)

    def _read_excel(self, key: str) -> pd.DataFrame:
        """Read Excel bytes from storage and convert to dataframe."""
        try:
            content = self.storage.read_bytes(key)
            return pd.read_excel(BytesIO(content), dtype=str).fillna("")
        except StorageError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise StorageError(f"Failed to read excel file: {key}") from exc

    def _read_excel_workbook(self, key: str) -> dict[str, pd.DataFrame]:
        """Read an Excel workbook as sheet-name -> dataframe mapping."""
        try:
            content = self.storage.read_bytes(key)
            parsed = pd.read_excel(BytesIO(content), sheet_name=None, dtype=str)
            return {
                str(sheet_name): sheet_df.fillna("")
                for sheet_name, sheet_df in parsed.items()
            }
        except StorageError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise StorageError(f"Failed reading excel workbook: {key}") from exc

    def _read_seed_people_file(self, seed_path: Path) -> pd.DataFrame:
        """Read seed people file from disk (.xlsx/.xls/.xlsm/.csv)."""
        suffix = seed_path.suffix.strip().lower()
        try:
            if suffix in {".xlsx", ".xls", ".xlsm"}:
                return pd.read_excel(seed_path, dtype=str).fillna("")
            if suffix == ".csv":
                return pd.read_csv(seed_path, dtype=str).fillna("")
        except Exception as exc:  # noqa: BLE001
            raise ValidationError(f"Failed reading seed people file: {seed_path}") from exc

        raise ValidationError("seed_people_file must be .xlsx, .xls, .xlsm, or .csv")

    def _to_excel_bytes(self, df: pd.DataFrame) -> bytes:
        """Serialize dataframe into xlsx bytes."""
        buffer = BytesIO()
        with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
            df.to_excel(writer, index=False)
        return buffer.getvalue()

    def _to_daily_workbook_bytes(self, snapshot_df: pd.DataFrame, events_df: pd.DataFrame) -> bytes:
        """Serialize one daily workbook with `snapshot` + `location_events` sheets."""
        buffer = BytesIO()
        with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
            snapshot_df.to_excel(writer, index=False, sheet_name=DAILY_SNAPSHOT_SHEET)
            events_df.to_excel(writer, index=False, sheet_name=DAILY_LOCATION_EVENTS_SHEET)
        return buffer.getvalue()

    def _build_export_excel_bytes(
        self,
        snapshot_df: pd.DataFrame,
        events_df: pd.DataFrame,
        snapshot_date: date,
    ) -> bytes:
        """Build export workbook bytes with snapshot, events, and transitions sheets."""
        snapshot_export_df = self._build_snapshot_export_df(snapshot_df, events_df, snapshot_date)
        events_export_df = self._build_location_events_export_df(snapshot_df, events_df, snapshot_date)
        transitions_export_df = self._build_transitions_export_df(snapshot_df, events_df, snapshot_date)

        buffer = BytesIO()
        with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
            snapshot_export_df.to_excel(writer, index=False, sheet_name="snapshot")
            events_export_df.to_excel(writer, index=False, sheet_name="location_events")
            transitions_export_df.to_excel(writer, index=False, sheet_name="transitions")
        return buffer.getvalue()

    def _build_snapshot_export_df(
        self,
        snapshot_df: pd.DataFrame,
        events_df: pd.DataFrame,
        snapshot_date: date,
    ) -> pd.DataFrame:
        """Build snapshot export dataframe enriched with per-person location history fields."""
        export_df = self._normalize_snapshot_df(snapshot_df, snapshot_date).copy()
        events_source = self._normalize_location_events_df(events_df, snapshot_date)
        active_moves = self._filter_active_move_events(events_source)
        events_by_person: dict[str, list[dict[str, str]]] = {}

        for _, row in self._sort_location_events_df(active_moves).iterrows():
            person_key = str(row["person_id"])
            events_by_person.setdefault(person_key, []).append(
                {
                    "occurred_at": self._normalize_event_timestamp(row["occurred_at"]),
                    "location": self._normalize_location(row["location"]),
                    "daily_status": self._normalize_daily_status(row["daily_status"]),
                }
            )

        location_paths: list[str] = []
        location_timelines: list[str] = []
        location_events_counts: list[int] = []

        for _, person_row in export_df.iterrows():
            person_id = str(person_row["person_id"])
            current_location = self._normalize_location(person_row["location"])
            person_events = events_by_person.get(person_id, [])

            if not person_events:
                location_paths.append(current_location)
                location_timelines.append("")
                location_events_counts.append(0)
                continue

            visited_locations: list[str] = []
            timeline_rows: list[str] = []
            for event in person_events:
                event_location = event["location"]
                if event_location not in visited_locations:
                    visited_locations.append(event_location)
                occurred_at_value = str(event["occurred_at"])
                occurred_at_display = occurred_at_value
                try:
                    occurred_at_dt = datetime.fromisoformat(occurred_at_value.replace("Z", "+00:00"))
                    if occurred_at_dt.tzinfo is None:
                        occurred_at_dt = occurred_at_dt.replace(tzinfo=timezone.utc)
                    occurred_at_display = occurred_at_dt.astimezone(timezone.utc).strftime("%H:%M")
                except ValueError:
                    # Keep original value when timestamp cannot be parsed.
                    occurred_at_display = occurred_at_value

                timeline_rows.append(
                    f"שעה: {occurred_at_display}, מיקום: {event_location}, סטטוס: {event['daily_status']}"
                )

            if current_location not in visited_locations:
                visited_locations.append(current_location)

            location_paths.append(" -> ".join(visited_locations))
            location_timelines.append("\n".join(timeline_rows))
            location_events_counts.append(len(person_events))

        export_df["locations_visited"] = location_paths
        export_df["location_events_count"] = location_events_counts
        export_df["location_timeline"] = location_timelines
        return export_df

    def _build_location_events_export_df(
        self,
        snapshot_df: pd.DataFrame,
        events_df: pd.DataFrame,
        snapshot_date: date,
    ) -> pd.DataFrame:
        """Build detailed location-events export dataframe with person names."""
        events_source = self._normalize_location_events_df(events_df, snapshot_date)
        if events_source.empty:
            return pd.DataFrame(
                columns=[
                    "event_id",
                    "person_id",
                    "full_name",
                    "event_type",
                    "target_event_id",
                    "is_voided",
                    "voided_at",
                    "voided_by_event_id",
                    "location",
                    "daily_status",
                    "occurred_at",
                    "created_at",
                    "source",
                    "date",
                ]
            )

        people_source = self._normalize_snapshot_df(snapshot_df, snapshot_date)
        full_name_by_id = {
            str(item["person_id"]): str(item["full_name"])
            for _, item in people_source.iterrows()
        }

        export_df = self._sort_location_events_df(events_source, descending=True).copy()
        if "full_name" not in export_df.columns:
            export_df["full_name"] = ""
        export_df["full_name"] = export_df["full_name"].astype(str).map(
            lambda item: "" if item.strip().lower() == "nan" else item.strip()
        )
        missing_name_mask = export_df["full_name"] == ""
        if missing_name_mask.any():
            export_df.loc[missing_name_mask, "full_name"] = (
                export_df.loc[missing_name_mask, "person_id"].astype(str).map(full_name_by_id).fillna("")
            )
        export_df["event_type"] = export_df["event_type"].map(self._normalize_event_type)
        export_df["target_event_id"] = export_df["target_event_id"].astype(str).map(
            lambda item: item.strip() or ""
        )
        export_df["is_voided"] = export_df["is_voided"].map(self._parse_bool)
        export_df["voided_at"] = export_df["voided_at"].map(self._normalize_nullable_event_timestamp)
        export_df["voided_by_event_id"] = export_df["voided_by_event_id"].astype(str).map(
            lambda item: item.strip() or ""
        )
        export_df["location"] = export_df["location"].map(self._normalize_location)
        export_df["daily_status"] = export_df["daily_status"].map(self._normalize_daily_status)
        export_df["occurred_at"] = export_df["occurred_at"].map(self._normalize_event_timestamp)
        export_df["created_at"] = export_df["created_at"].map(self._normalize_event_timestamp)
        export_df["source"] = export_df["source"].astype(str).map(
            lambda item: item.strip() or DEFAULT_EVENT_SOURCE
        )
        return export_df[
            [
                "event_id",
                "person_id",
                "full_name",
                "event_type",
                "target_event_id",
                "is_voided",
                "voided_at",
                "voided_by_event_id",
                "location",
                "daily_status",
                "occurred_at",
                "created_at",
                "source",
                "date",
            ]
        ]

    def _build_transitions_export_df(
        self,
        snapshot_df: pd.DataFrame,
        events_df: pd.DataFrame,
        snapshot_date: date,
    ) -> pd.DataFrame:
        """Build transitions export dataframe for all people on selected date."""
        transitions_df = self._build_transitions_df(snapshot_df, events_df, snapshot_date)
        if transitions_df.empty:
            return pd.DataFrame(columns=TRANSITION_COLUMNS)
        return self._sort_transitions_df(transitions_df, descending=True).reset_index(drop=True)

    def _row_to_record(self, row: pd.Series) -> dict:
        """Convert one dataframe row into API response dictionary."""
        return {
            "person_id": str(row["person_id"]),
            "full_name": str(row["full_name"]),
            "location": self._normalize_location(row["location"]),
            "daily_status": self._normalize_daily_status(row["daily_status"]),
            "self_location": self._empty_to_none(self._normalize_self_location(row.get("self_location", ""))),
            "self_daily_status": self._empty_to_none(
                self._normalize_self_daily_status(row.get("self_daily_status", ""))
            ),
            "notes": self._normalize_notes(row["notes"]),
            "last_updated": self._normalize_timestamp(row["last_updated"]),
            "date": date.fromisoformat(str(row["date"])),
        }

    def _event_row_to_record(self, row: pd.Series) -> dict:
        """Convert one location-event dataframe row into API response dictionary."""
        return {
            "event_id": str(row["event_id"]),
            "person_id": str(row["person_id"]),
            "event_type": self._normalize_event_type(row.get("event_type", "move")),
            "location": self._normalize_location(row["location"]),
            "daily_status": self._normalize_daily_status(row["daily_status"]),
            "target_event_id": self._empty_to_none(str(row.get("target_event_id", "")).strip()),
            "is_voided": self._parse_bool(row.get("is_voided")),
            "voided_at": self._empty_to_none(self._normalize_nullable_event_timestamp(row.get("voided_at", ""))),
            "voided_by_event_id": self._empty_to_none(str(row.get("voided_by_event_id", "")).strip()),
            "occurred_at": self._normalize_event_timestamp(row["occurred_at"]),
            "created_at": self._normalize_event_timestamp(row["created_at"]),
            "source": str(row["source"]).strip() or DEFAULT_EVENT_SOURCE,
            "date": date.fromisoformat(str(row["date"])),
        }

    def _transition_row_to_record(self, row: pd.Series) -> dict:
        """Convert one transition dataframe row into API response dictionary."""
        dwell_minutes_raw = row.get("dwell_minutes", 0)
        try:
            dwell_minutes = int(dwell_minutes_raw)
        except (TypeError, ValueError):
            dwell_minutes = 0

        return {
            "transition_id": str(row["transition_id"]),
            "person_id": str(row["person_id"]),
            "full_name": str(row.get("full_name", "")),
            "from_location": self._normalize_location(row["from_location"]),
            "to_location": self._normalize_location(row["to_location"]),
            "moved_at": self._normalize_event_timestamp(row["moved_at"]),
            "from_occurred_at": self._normalize_event_timestamp(row["from_occurred_at"]),
            "to_occurred_at": self._normalize_event_timestamp(row["to_occurred_at"]),
            "dwell_minutes": max(0, dwell_minutes),
            "from_event_id": str(row["from_event_id"]),
            "to_event_id": str(row["to_event_id"]),
            "transition_source": self._normalize_transition_source(row.get("transition_source", "ui")),
            "transition_source_raw": str(row.get("transition_source_raw", "")).strip() or DEFAULT_EVENT_SOURCE,
            "date": date.fromisoformat(str(row["date"])),
        }

    def _normalize_location(self, value: object) -> str:
        """Normalize free-text location (with legacy alias support)."""
        cleaned = str(value).strip() if value is not None else ""
        if cleaned in LOCATION_ALIASES:
            cleaned = LOCATION_ALIASES[cleaned]
        if not cleaned or cleaned.lower() == "nan":
            return DEFAULT_LOCATION
        return cleaned

    def _normalize_location_option(self, value: object) -> str | None:
        """Normalize one location option value for locations list."""
        cleaned = str(value).strip() if value is not None else ""
        if cleaned in LOCATION_ALIASES:
            cleaned = LOCATION_ALIASES[cleaned]
        if not cleaned or cleaned.lower() == "nan":
            return None
        return cleaned

    def _normalize_event_type(self, value: object) -> str:
        """Normalize location-event type to known values."""
        cleaned = str(value).strip().lower() if value is not None else ""
        return cleaned if cleaned in VALID_EVENT_TYPES else "move"

    def _normalize_transition_source(self, value: object) -> str:
        """Map internal event source markers to one display category used by tracking UI."""
        cleaned = str(value).strip().lower() if value is not None else ""
        if not cleaned:
            return "ui"
        if (
            "bot" in cleaned
            or "telegram" in cleaned
            or "self_report" in cleaned
            or "self-report" in cleaned
        ):
            return "bot"
        return "ui"

    def _parse_bool(self, value: object) -> bool:
        """Normalize mixed bool/string values from Excel into bool."""
        if isinstance(value, bool):
            return value
        if value is None:
            return False
        if isinstance(value, (int, float)):
            return bool(value)

        cleaned = str(value).strip().lower()
        if cleaned in {"1", "true", "yes", "y", "כן"}:
            return True
        if cleaned in {"0", "false", "no", "n", "לא", ""}:
            return False
        return False

    def _normalize_nullable_event_timestamp(self, value: object) -> str:
        """Normalize nullable event timestamp; keep empty values empty."""
        if value is None:
            return ""

        candidate = str(value).strip()
        if not candidate or candidate.lower() == "nan":
            return ""

        try:
            parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
        except ValueError:
            return ""

        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)

        return parsed.astimezone(timezone.utc).isoformat()

    def _validate_location_allowed(self, location_value: str, *, field_name: str) -> None:
        """Validate location value against configured location options list."""
        available_locations = set(self.get_locations())
        if location_value in available_locations:
            return

        options_preview = ", ".join(sorted(available_locations))
        raise ValidationError(
            f"{field_name} must be one of configured locations: {options_preview}"
        )

    def _normalize_daily_status(self, value: object) -> str:
        """Normalize daily status to known values with safe default."""
        cleaned = str(value).strip() if value is not None else ""
        if cleaned in DAILY_STATUS_ALIASES:
            cleaned = DAILY_STATUS_ALIASES[cleaned]
        return cleaned if cleaned in VALID_DAILY_STATUS else DEFAULT_DAILY_STATUS

    def _normalize_self_location(self, value: object) -> str:
        """Normalize self-reported location while allowing empty value."""
        cleaned = str(value).strip() if value is not None else ""
        if cleaned in LOCATION_ALIASES:
            cleaned = LOCATION_ALIASES[cleaned]
        if not cleaned or cleaned.lower() == "nan":
            return ""
        return cleaned

    def _normalize_self_daily_status(self, value: object) -> str:
        """Normalize self-reported status while allowing empty value."""
        cleaned = str(value).strip() if value is not None else ""
        if cleaned in DAILY_STATUS_ALIASES:
            cleaned = DAILY_STATUS_ALIASES[cleaned]
        return cleaned if cleaned in VALID_SELF_DAILY_STATUS else ""

    def _normalize_required_daily_status(self, value: object) -> str:
        """Strictly validate required status value for self-report flows."""
        cleaned = str(value).strip() if value is not None else ""
        if cleaned in DAILY_STATUS_ALIASES:
            cleaned = DAILY_STATUS_ALIASES[cleaned]
        if cleaned not in VALID_SELF_DAILY_STATUS:
            raise ValidationError("daily_status must be either 'תקין' or 'לא תקין'")
        return cleaned

    def _normalize_notes(self, value: object) -> str:
        """Normalize notes text and clear NaN markers."""
        if value is None:
            return ""
        cleaned = str(value).strip()
        return "" if cleaned.lower() == "nan" else cleaned

    def _normalize_timestamp(self, value: object) -> str:
        """Normalize timestamps to UTC ISO format."""
        if value is None:
            return self._now_iso()

        candidate = str(value).strip()
        if not candidate or candidate.lower() == "nan":
            return self._now_iso()

        try:
            parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
            return parsed.astimezone(timezone.utc).replace(microsecond=0).isoformat()
        except ValueError:
            return self._now_iso()

    def _normalize_optional_event_timestamp(self, value: object, *, field_name: str) -> str:
        """Normalize optional location-event timestamp input, raising validation errors for bad values."""
        if value is None:
            return self._now_iso_precise()

        candidate = str(value).strip()
        if not candidate:
            return self._now_iso_precise()

        try:
            parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValidationError(f"{field_name} must be a valid ISO datetime") from exc

        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)

        return parsed.astimezone(timezone.utc).isoformat()

    def _now_iso(self) -> str:
        """Return current UTC time in ISO format without microseconds."""
        return datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    def _now_iso_precise(self) -> str:
        """Return current UTC time in ISO format including microseconds."""
        return datetime.now(timezone.utc).isoformat()

    def _normalize_event_timestamp(self, value: object) -> str:
        """Normalize event timestamps to UTC ISO format while preserving microseconds."""
        if value is None:
            return self._now_iso_precise()

        candidate = str(value).strip()
        if not candidate or candidate.lower() == "nan":
            return self._now_iso_precise()

        try:
            parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
        except ValueError:
            return self._now_iso_precise()

        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)

        return parsed.astimezone(timezone.utc).isoformat()

    def _sort_location_events_df(
        self,
        df: pd.DataFrame,
        *,
        descending: bool = False,
    ) -> pd.DataFrame:
        """Return events dataframe sorted by timeline fields in deterministic order."""
        if df.empty:
            return df

        return df.sort_values(
            by=["occurred_at", "created_at", "event_id"],
            ascending=not descending,
            kind="stable",
        )

    def _build_transitions_df(
        self,
        snapshot_df: pd.DataFrame,
        events_df: pd.DataFrame,
        snapshot_date: date,
    ) -> pd.DataFrame:
        """Build computed transitions dataframe from active move events only."""
        people_source = self._normalize_snapshot_df(snapshot_df, snapshot_date)
        full_name_by_id = {
            str(item["person_id"]): str(item["full_name"])
            for _, item in people_source.iterrows()
        }

        events_source = self._normalize_location_events_df(events_df, snapshot_date)
        active_moves = self._filter_active_move_events(events_source)
        if active_moves.empty:
            return pd.DataFrame(columns=TRANSITION_COLUMNS)

        transitions_rows: list[dict] = []
        sorted_moves = self._sort_location_events_df(active_moves, descending=False)
        for person_id, person_events in sorted_moves.groupby("person_id", sort=False):
            person_rows = person_events.reset_index(drop=True)
            if len(person_rows.index) < 2:
                continue

            for index in range(1, len(person_rows.index)):
                previous = person_rows.iloc[index - 1]
                current = person_rows.iloc[index]
                from_location = self._normalize_location(previous["location"])
                to_location = self._normalize_location(current["location"])
                if from_location == to_location:
                    continue

                previous_at = self._normalize_event_timestamp(previous["occurred_at"])
                current_at = self._normalize_event_timestamp(current["occurred_at"])
                try:
                    previous_dt = datetime.fromisoformat(previous_at.replace("Z", "+00:00"))
                    current_dt = datetime.fromisoformat(current_at.replace("Z", "+00:00"))
                except ValueError:
                    continue

                if previous_dt.tzinfo is None:
                    previous_dt = previous_dt.replace(tzinfo=timezone.utc)
                if current_dt.tzinfo is None:
                    current_dt = current_dt.replace(tzinfo=timezone.utc)

                dwell_seconds = (current_dt - previous_dt).total_seconds()
                dwell_minutes = int(max(0, dwell_seconds) // 60)
                to_event_id = str(current["event_id"])
                transition_id = f"T-{to_event_id}"
                transition_source_raw = str(current.get("source", "")).strip() or DEFAULT_EVENT_SOURCE
                transition_source = self._normalize_transition_source(transition_source_raw)

                transitions_rows.append(
                    {
                        "transition_id": transition_id,
                        "person_id": str(person_id),
                        "full_name": full_name_by_id.get(str(person_id), ""),
                        "from_location": from_location,
                        "to_location": to_location,
                        "moved_at": current_at,
                        "from_occurred_at": previous_at,
                        "to_occurred_at": current_at,
                        "dwell_minutes": dwell_minutes,
                        "from_event_id": str(previous["event_id"]),
                        "to_event_id": to_event_id,
                        "transition_source": transition_source,
                        "transition_source_raw": transition_source_raw,
                        "date": snapshot_date.isoformat(),
                    }
                )

        if not transitions_rows:
            return pd.DataFrame(columns=TRANSITION_COLUMNS)

        transitions_df = pd.DataFrame(transitions_rows, columns=TRANSITION_COLUMNS)
        transitions_df["dwell_minutes"] = transitions_df["dwell_minutes"].astype(int)
        return transitions_df

    def _sort_transitions_df(
        self,
        df: pd.DataFrame,
        *,
        descending: bool = False,
    ) -> pd.DataFrame:
        """Sort transitions deterministically."""
        if df.empty:
            return df

        return df.sort_values(
            by=["moved_at", "to_event_id", "transition_id"],
            ascending=not descending,
            kind="stable",
        )

    def _find_person_row_index(self, snapshot_df: pd.DataFrame, person_id: str) -> int:
        """Resolve person row index by exact person_id."""
        matches = snapshot_df.index[snapshot_df["person_id"] == person_id].tolist()
        if not matches:
            raise NotFoundError(f"Person '{person_id}' was not found in snapshot")
        return int(matches[0])

    def _validate_person_exists(self, snapshot_df: pd.DataFrame, person_id: str) -> None:
        """Validate that person_id exists in provided snapshot dataframe."""
        _ = self._find_person_row_index(snapshot_df, person_id)

    def _append_location_event(
        self,
        *,
        events_df: pd.DataFrame,
        snapshot_date: date,
        person_id: str,
        full_name: str = "",
        event_type: str,
        target_event_id: str | None = None,
        location: str,
        daily_status: str,
        occurred_at: str,
        source: str = DEFAULT_EVENT_SOURCE,
    ) -> tuple[dict, pd.DataFrame]:
        """Build updated location-events dataframe with one appended row (no storage write)."""
        normalized_events = self._normalize_location_events_df(events_df, snapshot_date)
        normalized_event_type = str(event_type).strip().lower()
        if normalized_event_type not in VALID_EVENT_TYPES:
            allowed = ", ".join(sorted(VALID_EVENT_TYPES))
            raise ValidationError(f"event_type must be one of: {allowed}")

        normalized_target_event_id = str(target_event_id).strip() if target_event_id is not None else ""
        if normalized_event_type == "move":
            normalized_target_event_id = ""

        used_event_ids = (
            set(normalized_events["event_id"].astype(str).tolist())
            if not normalized_events.empty
            else set()
        )
        event_id = self._generate_event_id(used_event_ids)
        created_at = self._now_iso_precise()

        new_row = {
            "event_id": event_id,
            "person_id": person_id,
            "full_name": str(full_name).strip(),
            "event_type": normalized_event_type,
            "target_event_id": normalized_target_event_id,
            "is_voided": False,
            "voided_at": "",
            "voided_by_event_id": "",
            "location": self._normalize_location(location),
            "daily_status": self._normalize_daily_status(daily_status),
            "occurred_at": self._normalize_event_timestamp(occurred_at),
            "created_at": created_at,
            "source": str(source).strip() or DEFAULT_EVENT_SOURCE,
            "date": snapshot_date.isoformat(),
        }
        combined_df = pd.concat(
            [normalized_events, pd.DataFrame([new_row], columns=LOCATION_EVENT_COLUMNS)],
            ignore_index=True,
        )
        combined_df = self._normalize_location_events_df(combined_df, snapshot_date)

        created_row = combined_df.loc[combined_df["event_id"] == event_id].iloc[0]
        return self._event_row_to_record(created_row), combined_df

    def _filter_active_move_events(self, events_df: pd.DataFrame) -> pd.DataFrame:
        """Filter only active move events (ignore correction/undo and voided rows)."""
        if events_df is None or events_df.empty:
            return pd.DataFrame(columns=LOCATION_EVENT_COLUMNS)

        filtered = events_df.copy()
        for column in LOCATION_EVENT_COLUMNS:
            if column not in filtered.columns:
                filtered[column] = ""

        filtered["event_type"] = filtered["event_type"].map(self._normalize_event_type)
        filtered["is_voided"] = filtered["is_voided"].map(self._parse_bool)
        filtered = filtered[
            (filtered["event_type"] == "move")
            & (~filtered["is_voided"])
        ].copy()
        if filtered.empty:
            return pd.DataFrame(columns=LOCATION_EVENT_COLUMNS)
        return filtered[LOCATION_EVENT_COLUMNS].copy()

    def _get_latest_active_move_event_for_person(
        self,
        events_df: pd.DataFrame,
        person_id: str,
    ) -> dict | None:
        """Return latest active move event record for one person or None."""
        active_moves = self._filter_active_move_events(events_df)
        if active_moves.empty:
            return None

        person_events = active_moves[active_moves["person_id"] == person_id].copy()
        if person_events.empty:
            return None

        latest_row = self._sort_location_events_df(person_events, descending=True).iloc[0]
        return self._event_row_to_record(latest_row)

    def _apply_current_state_from_events(
        self,
        snapshot_df: pd.DataFrame,
        row_index: int,
        person_id: str,
        events_df: pd.DataFrame,
    ) -> None:
        """Apply current snapshot state from latest active move event for this person."""
        latest_move = self._get_latest_active_move_event_for_person(events_df, person_id)
        if latest_move is None:
            snapshot_df.at[row_index, "location"] = DEFAULT_LOCATION
            snapshot_df.at[row_index, "daily_status"] = DEFAULT_DAILY_STATUS
            snapshot_df.at[row_index, "last_updated"] = self._now_iso()
            return

        snapshot_df.at[row_index, "location"] = self._normalize_location(latest_move["location"])
        snapshot_df.at[row_index, "daily_status"] = self._normalize_daily_status(latest_move["daily_status"])
        snapshot_df.at[row_index, "last_updated"] = self._now_iso()

    def _build_transition_warning(
        self,
        previous_move_event: dict | None,
        new_move_event: dict,
    ) -> str | None:
        """Build warning message for suspiciously fast location transitions."""
        if previous_move_event is None:
            return None

        from_location = self._normalize_location(previous_move_event.get("location", ""))
        to_location = self._normalize_location(new_move_event.get("location", ""))
        if from_location == to_location:
            return None

        try:
            previous_time = datetime.fromisoformat(
                str(previous_move_event.get("occurred_at", "")).replace("Z", "+00:00")
            )
            new_time = datetime.fromisoformat(str(new_move_event.get("occurred_at", "")).replace("Z", "+00:00"))
        except ValueError:
            return None

        if previous_time.tzinfo is None:
            previous_time = previous_time.replace(tzinfo=timezone.utc)
        if new_time.tzinfo is None:
            new_time = new_time.replace(tzinfo=timezone.utc)

        delta_seconds = (new_time - previous_time).total_seconds()
        if delta_seconds < 0:
            return None
        if delta_seconds >= SUSPICIOUS_TRANSITION_SECONDS:
            return None

        return (
            f"מעבר חשוד: מעבר מ-{from_location} ל-{to_location} תוך "
            f"{int(delta_seconds)} שניות בלבד."
        )

    def _build_person_location_events_payload(
        self,
        person_id: str,
        snapshot_date: date,
        *,
        events_df: pd.DataFrame | None = None,
        include_voided: bool = True,
        last_action_event_id: str | None = None,
        last_action_type: str | None = None,
        latest_transition_warning: str | None = None,
    ) -> dict:
        """Build API payload for one person's date tracking events timeline."""
        source_df = (
            self._normalize_location_events_df(events_df, snapshot_date)
            if events_df is not None
            else self.load_location_events(snapshot_date)
        )
        payload = {
            "date": snapshot_date,
            "person_id": person_id,
            "events": [],
            "last_action_event_id": self._empty_to_none(str(last_action_event_id or "").strip()),
            "last_action_type": self._empty_to_none(str(last_action_type or "").strip()),
            "latest_transition_warning": self._empty_to_none(str(latest_transition_warning or "").strip()),
        }
        if source_df.empty:
            return payload

        person_events = source_df[source_df["person_id"] == person_id].copy()
        if person_events.empty:
            return payload

        if not include_voided:
            person_events = person_events[~person_events["is_voided"].map(self._parse_bool)].copy()

        person_events = self._sort_location_events_df(person_events, descending=True)
        payload["events"] = [self._event_row_to_record(row) for _, row in person_events.iterrows()]
        return payload

    def _find_row_index_for_lookup(self, snapshot_df: pd.DataFrame, person_lookup: str) -> int:
        """Resolve one row index from person_id or full_name lookup text."""
        lookup = person_lookup.strip()
        if not lookup:
            raise ValidationError("person_lookup cannot be empty")

        id_matches = snapshot_df.index[snapshot_df["person_id"] == lookup].tolist()
        if id_matches:
            return int(id_matches[0])

        lowered_lookup = lookup.lower()
        name_matches = snapshot_df.index[
            snapshot_df["full_name"].astype(str).str.strip().str.lower() == lowered_lookup
        ].tolist()
        if len(name_matches) == 1:
            return int(name_matches[0])
        if len(name_matches) > 1:
            matching_people = snapshot_df.loc[name_matches, ["person_id", "full_name"]]
            options = ", ".join(
                f"{row['full_name']} ({row['person_id']})"
                for _, row in matching_people.iterrows()
            )
            raise ValidationError(
                "More than one person has this full_name. Please use person_id instead. "
                f"Matches: {options}"
            )

        raise NotFoundError(f"Person '{lookup}' was not found in today's snapshot")

    def _empty_to_none(self, value: str) -> str | None:
        """Convert empty strings to None for cleaner API responses."""
        cleaned = value.strip()
        return cleaned if cleaned else None

