from __future__ import annotations

import logging
import threading
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
# Backward compatibility for historical files that still contain legacy names.
LOCATION_ALIASES = {
    "ביחידה": "מיקום 1",
}
VALID_DAILY_STATUS = {"תקין", "לא תקין"}
DEFAULT_LOCATION = "בבית"
DEFAULT_DAILY_STATUS = "תקין"
DEFAULT_LOCATION_OPTIONS = ["בבית", "מיקום 1", "מיקום 2", "מיקום 3", "מיקום 4", "מיקום 5"]


class SnapshotService:
    """Business logic service that manages daily snapshots and people master list."""

    def __init__(self, settings: Settings, storage: StorageProvider) -> None:
        """Store runtime settings and selected storage provider."""
        self.settings = settings
        self.storage = storage
        # Protect read-modify-write flows across HTTP requests and Telegram thread.
        self._write_lock = threading.RLock()

    def initialize_today_snapshot(self) -> None:
        """Load or create today's snapshot during app startup."""
        self.ensure_master_people()
        self.ensure_locations_file()
        self.ensure_snapshot_for_date(date.today())

    def get_today_snapshot(self) -> dict:
        """Return today's full snapshot, creating it when missing."""
        today = date.today()
        return self.get_snapshot_for_date(today, create_if_missing=True)

    def get_snapshot_for_date(self, snapshot_date: date, create_if_missing: bool = False) -> dict:
        """Return a normalized snapshot payload for a requested date."""
        df = self.load_snapshot(snapshot_date, create_if_missing=create_if_missing)
        people = [self._row_to_record(row) for _, row in df.iterrows()]
        return {"date": snapshot_date, "people": people}

    def list_available_dates(self) -> list[date]:
        """List all snapshot dates currently available in storage."""
        prefix = self.settings.s3_snapshots_prefix.strip("/")
        keys = self.storage.list_keys(prefix)

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

        content = self.storage.read_bytes(snapshot_key)
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

                snapshot_content = self.storage.read_bytes(snapshot_key)
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
        with self._write_lock:
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
        with self._write_lock:
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

            updated_df = locations_df[locations_df["location"] != normalized_name].copy()
            self.save_locations(updated_df)
            return self.load_locations()["location"].tolist()

    def add_person_today(self, payload: PersonCreate) -> dict:
        """Add a person to master list and today's snapshot."""
        with self._write_lock:
            master_df = self.load_master_people()
            existing_ids = set(master_df["person_id"].tolist())

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

            new_row = {
                "person_id": new_person_id,
                "full_name": payload.full_name.strip(),
                "location": payload.location,
                "daily_status": payload.daily_status,
                "self_location": "",
                "self_daily_status": "",
                "notes": payload.notes,
                "last_updated": self._now_iso(),
                "date": today.isoformat(),
            }
            snapshot_df = pd.concat([snapshot_df, pd.DataFrame([new_row], columns=SNAPSHOT_COLUMNS)], ignore_index=True)
            snapshot_df = self._normalize_snapshot_df(snapshot_df, today)
            self.save_snapshot(today, snapshot_df)

            return self._row_to_record(snapshot_df.loc[snapshot_df["person_id"] == new_person_id].iloc[0])

    def update_person_today(self, person_id: str, payload: PersonUpdate) -> dict:
        """Apply partial updates to one person in today's snapshot."""
        patch = payload.model_dump(exclude_unset=True)
        if not patch:
            raise ValidationError("No fields were provided for update")

        with self._write_lock:
            today = date.today()
            snapshot_df = self.load_snapshot(today, create_if_missing=True)
            matches = snapshot_df.index[snapshot_df["person_id"] == person_id].tolist()
            if not matches:
                raise NotFoundError(f"Person '{person_id}' was not found in today's snapshot")

            row_index = matches[0]
            for field_name, field_value in patch.items():
                if field_value is not None:
                    snapshot_df.at[row_index, field_name] = field_value

            snapshot_df.at[row_index, "last_updated"] = self._now_iso()
            snapshot_df = self._normalize_snapshot_df(snapshot_df, today)
            self.save_snapshot(today, snapshot_df)

            # Name changes are persisted in master list so new snapshots will include the updated name.
            if patch.get("full_name"):
                self._update_master_name(person_id, patch["full_name"])

            updated_row = snapshot_df.loc[snapshot_df["person_id"] == person_id].iloc[0]
            return self._row_to_record(updated_row)

    def update_self_report_today(self, person_lookup: str, self_location: str, self_daily_status: str) -> dict:
        """
        Update self-reported location and status for today's snapshot.

        person_lookup supports either:
        - exact `person_id` value
        - exact `full_name` (case-insensitive)
        """
        with self._write_lock:
            today = date.today()
            snapshot_df = self.load_snapshot(today, create_if_missing=True)
            row_index = self._find_row_index_for_lookup(snapshot_df, person_lookup)
            person_id = str(snapshot_df.at[row_index, "person_id"])

            location_value = self._normalize_location_option(self_location)
            if not location_value:
                raise ValidationError("self_location cannot be empty")

            status_value = self._normalize_required_daily_status(self_daily_status)
            snapshot_df.at[row_index, "self_location"] = location_value
            snapshot_df.at[row_index, "self_daily_status"] = status_value
            snapshot_df.at[row_index, "last_updated"] = self._now_iso()

            snapshot_df = self._normalize_snapshot_df(snapshot_df, today)
            self.save_snapshot(today, snapshot_df)

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
        with self._write_lock:
            today = date.today()
            snapshot_df = self.load_snapshot(today, create_if_missing=True)
            matches = snapshot_df.index[snapshot_df["person_id"] == person_id].tolist()
            if not matches:
                raise NotFoundError(f"Person '{person_id}' was not found in today's snapshot")

            deleted_row = snapshot_df.loc[matches[0]].copy()
            snapshot_df = snapshot_df[snapshot_df["person_id"] != person_id].copy()
            snapshot_df = self._normalize_snapshot_df(snapshot_df, today)
            self.save_snapshot(today, snapshot_df)

            master_df = self.load_master_people()
            master_df = master_df[master_df["person_id"] != person_id].copy()
            self.save_master_people(master_df)

            return self._row_to_record(deleted_row)

    def restore_snapshot_to_today(self, source_date: date) -> dict:
        """Restore a historical snapshot into today's snapshot file."""
        with self._write_lock:
            today = date.today()
            if source_date == today:
                return self.get_snapshot_for_date(today, create_if_missing=True)

            source_df = self.load_snapshot(source_date, create_if_missing=False)
            master_df = self.load_master_people()

            restored_df = self._build_snapshot_from_master(
                master_df,
                source_df,
                today,
                carry_self_report_fields=True,
            )
            self.save_snapshot(today, restored_df)
            logger.info("Restored snapshot from %s into %s", source_date.isoformat(), today.isoformat())
            return self.get_snapshot_for_date(today, create_if_missing=False)

    def ensure_snapshot_for_date(self, snapshot_date: date) -> pd.DataFrame:
        """Ensure a snapshot file exists for the given date, then return it."""
        with self._write_lock:
            snapshot_key = self._snapshot_key(snapshot_date)
            if self.storage.exists(snapshot_key):
                return self.load_snapshot(snapshot_date, create_if_missing=False)

            master_df = self.ensure_master_people()
            previous_date = self._latest_snapshot_before(snapshot_date)

            if previous_date:
                # First choice: bootstrap the day from latest historical snapshot.
                logger.info("Creating %s snapshot based on previous day %s", snapshot_date, previous_date)
                previous_df = self.load_snapshot(previous_date, create_if_missing=False)
                new_snapshot = self._build_snapshot_from_master(
                    master_df,
                    previous_df,
                    snapshot_date,
                    carry_self_report_fields=False,
                )
            else:
                # Fallback for first run: create from master list defaults.
                logger.info("Creating first snapshot for %s from master list", snapshot_date)
                new_snapshot = self._build_snapshot_from_master(
                    master_df,
                    None,
                    snapshot_date,
                    carry_self_report_fields=False,
                )

            self.save_snapshot(snapshot_date, new_snapshot)
            return new_snapshot

    def load_snapshot(self, snapshot_date: date, create_if_missing: bool = False) -> pd.DataFrame:
        """Load and normalize one date snapshot from storage."""
        snapshot_key = self._snapshot_key(snapshot_date)
        if not self.storage.exists(snapshot_key):
            if create_if_missing:
                return self.ensure_snapshot_for_date(snapshot_date)
            raise NotFoundError(f"Snapshot does not exist for date {snapshot_date.isoformat()}")

        df = self._read_excel(snapshot_key)
        return self._normalize_snapshot_df(df, snapshot_date)

    def save_snapshot(self, snapshot_date: date, df: pd.DataFrame) -> None:
        """Normalize and persist one date snapshot to storage."""
        clean_df = self._normalize_snapshot_df(df, snapshot_date)
        content = self._to_excel_bytes(clean_df)
        self.storage.write_bytes(self._snapshot_key(snapshot_date), content)

    def ensure_master_people(self) -> pd.DataFrame:
        """Ensure master people file exists; bootstrap from seed if missing."""
        with self._write_lock:
            if self.storage.exists(self.settings.s3_master_key):
                return self.load_master_people()

            seed_path = self.settings.seed_people_file
            if not seed_path.exists():
                raise ValidationError(f"Seed people file was not found: {seed_path}")

            seed_df = pd.read_csv(seed_path, dtype=str).fillna("")
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
        self.storage.write_bytes(self.settings.s3_master_key, content)

    def ensure_locations_file(self) -> pd.DataFrame:
        """Ensure locations file exists; create it with defaults if missing."""
        with self._write_lock:
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
        self.storage.write_bytes(self.settings.s3_locations_key, content)

    def _update_master_name(self, person_id: str, full_name: str) -> None:
        """Sync updated name from snapshot back into master list."""
        master_df = self.load_master_people()
        matches = master_df.index[master_df["person_id"] == person_id].tolist()
        if not matches:
            return

        master_df.at[matches[0], "full_name"] = full_name.strip()
        self.save_master_people(master_df)

    def _build_snapshot_from_master(
        self,
        master_df: pd.DataFrame,
        source_df: pd.DataFrame | None,
        snapshot_date: date,
        carry_self_report_fields: bool,
    ) -> pd.DataFrame:
        """
        Create a full-day snapshot from master list and optional source snapshot.

        carry_self_report_fields controls whether self-reported columns are copied from source.
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
                {
                    "person_id": person_id,
                    "full_name": str(person["full_name"]).strip(),
                    "location": self._normalize_location(source_row["location"] if source_row is not None else None),
                    "daily_status": self._normalize_daily_status(source_row["daily_status"] if source_row is not None else None),
                    # Self-report fields are reset for a new day unless explicitly restored from history.
                    "self_location": self._normalize_self_location(
                        source_row["self_location"]
                        if (carry_self_report_fields and source_row is not None)
                        else ""
                    ),
                    "self_daily_status": self._normalize_self_daily_status(
                        source_row["self_daily_status"]
                        if (carry_self_report_fields and source_row is not None)
                        else ""
                    ),
                    "notes": self._normalize_notes(source_row["notes"] if source_row is not None else ""),
                    "last_updated": now_value,
                    "date": snapshot_date.isoformat(),
                }
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

    def _generate_person_id(self, used_ids: set[str]) -> str:
        """Generate a unique person identifier."""
        while True:
            candidate = f"P-{uuid4().hex[:8]}"
            if candidate not in used_ids:
                return candidate

    def _latest_snapshot_before(self, target_date: date) -> date | None:
        """Return the latest snapshot date older than target date."""
        dates = [item for item in self.list_available_dates() if item < target_date]
        if not dates:
            return None
        return max(dates)

    def _snapshot_key(self, snapshot_date: date) -> str:
        """Build storage key for snapshot file by date."""
        prefix = self.settings.s3_snapshots_prefix.strip("/")
        return f"{prefix}/{snapshot_date.isoformat()}.xlsx"

    def _read_excel(self, key: str) -> pd.DataFrame:
        """Read Excel bytes from storage and convert to dataframe."""
        try:
            content = self.storage.read_bytes(key)
            return pd.read_excel(BytesIO(content), dtype=str).fillna("")
        except StorageError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise StorageError(f"Failed to read excel file: {key}") from exc

    def _to_excel_bytes(self, df: pd.DataFrame) -> bytes:
        """Serialize dataframe into xlsx bytes."""
        buffer = BytesIO()
        with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
            df.to_excel(writer, index=False)
        return buffer.getvalue()

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

    def _normalize_daily_status(self, value: object) -> str:
        """Normalize daily status to known values with safe default."""
        cleaned = str(value).strip() if value is not None else ""
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
        return cleaned if cleaned in VALID_DAILY_STATUS else ""

    def _normalize_required_daily_status(self, value: object) -> str:
        """Strictly validate required status value for self-report flows."""
        cleaned = str(value).strip() if value is not None else ""
        if cleaned not in VALID_DAILY_STATUS:
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

    def _now_iso(self) -> str:
        """Return current UTC time in ISO format without microseconds."""
        return datetime.now(timezone.utc).replace(microsecond=0).isoformat()

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
