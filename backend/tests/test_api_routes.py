"""API route tests for request validation, response contracts, and snapshot endpoints.

Responsibility: protect HTTP behavior and integration expectations exposed to clients.
"""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

import pandas as pd
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from app.api.dependencies import get_settings, service_dep
from app.api.routers.export import router as export_router
from app.api.routers.locations import router as locations_router
from app.api.routers.people import router as people_router
from app.api.routers.snapshot import router as snapshot_router
from app.api.routers.tracking import router as tracking_router
from app.config import Settings
from app.exceptions import AppError, NotFoundError, StorageError, ValidationError
from app.services.snapshot_service import SnapshotService
from app.storage.providers import LocalStorageProvider


def _build_settings(
    tmp_path: Path,
    seed_file: Path,
) -> Settings:
    """Build Settings for API integration tests."""
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
        snapshot_restore_policy="exact_snapshot",
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
    *,
    seed_names: list[str],
) -> tuple[SnapshotService, Settings]:
    """Create snapshot service backed by temporary local storage."""
    seed_file = tmp_path / "seed_people.xlsx"
    pd.DataFrame([{"full_name": name} for name in seed_names]).to_excel(seed_file, index=False)
    settings = _build_settings(
        tmp_path=tmp_path,
        seed_file=seed_file,
    )
    storage = LocalStorageProvider(settings.local_storage_dir)
    service = SnapshotService(settings=settings, storage=storage)
    service.initialize_today_snapshot()
    return service, settings


def _build_test_client(service: SnapshotService, settings: Settings) -> TestClient:
    """Build lightweight FastAPI app with dependency overrides for router tests."""
    app = FastAPI()

    app.dependency_overrides[service_dep] = lambda: service
    app.dependency_overrides[get_settings] = lambda: settings

    @app.exception_handler(NotFoundError)
    async def _not_found_handler(_: object, exc: NotFoundError):
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(ValidationError)
    async def _validation_handler(_: object, exc: ValidationError):
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(StorageError)
    async def _storage_handler(_: object, exc: StorageError):
        return JSONResponse(status_code=500, content={"detail": str(exc)})

    @app.exception_handler(AppError)
    async def _app_error_handler(_: object, exc: AppError):
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    app.include_router(snapshot_router)
    app.include_router(export_router)
    app.include_router(locations_router)
    app.include_router(people_router)
    app.include_router(tracking_router)
    return TestClient(app)


def test_snapshot_endpoint_auto_creates_missing_past_date(tmp_path: Path) -> None:
    """GET snapshot/{date} should auto-create missing dates from master list."""
    service, settings = _build_service(tmp_path=tmp_path, seed_names=["Alice", "Bob"])
    client = _build_test_client(service, settings)
    target_date = (date.today() - timedelta(days=5)).isoformat()

    response = client.get(f"/api/snapshot/{target_date}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["date"] == target_date
    assert sorted(item["full_name"] for item in payload["people"]) == ["Alice", "Bob"]


def test_patch_person_rejects_unknown_location(tmp_path: Path) -> None:
    """PATCH /api/people should reject location values not configured in locations list."""
    service, settings = _build_service(tmp_path=tmp_path, seed_names=["Alice"])
    client = _build_test_client(service, settings)

    today_payload = client.get("/api/snapshot/today").json()
    person_id = today_payload["people"][0]["person_id"]

    response = client.patch(f"/api/people/{person_id}", json={"location": "מיקום לא קיים"})
    assert response.status_code == 400
    assert "configured locations" in response.json()["detail"]


def test_manual_save_snapshot_endpoint(tmp_path: Path) -> None:
    """POST /api/snapshot/{date}/save should persist selected date snapshot on demand."""
    service, settings = _build_service(tmp_path=tmp_path, seed_names=["Alice", "Bob"])
    client = _build_test_client(service, settings)
    target_date = (date.today() - timedelta(days=2)).isoformat()

    response = client.post(f"/api/snapshot/{target_date}/save")
    assert response.status_code == 200
    payload = response.json()
    assert payload["date"] == target_date
    assert payload["rows_saved"] == 2
    assert payload["snapshot_key"].endswith(f"{target_date}.xlsx")


def test_delete_snapshot_endpoint_removes_daily_workbook_and_events_data(tmp_path: Path) -> None:
    """DELETE /api/snapshot/{date} should remove daily workbook and location-events data."""
    service, settings = _build_service(tmp_path=tmp_path, seed_names=["Alice", "Bob"])
    client = _build_test_client(service, settings)
    target_day = date.today() - timedelta(days=2)
    target_date = target_day.isoformat()

    service.ensure_snapshot_for_date(target_day)
    service.save_location_events(target_day, pd.DataFrame())

    response = client.delete(f"/api/snapshot/{target_date}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["date"] == target_date
    assert payload["snapshot_deleted"] is True
    assert payload["events_existed"] is False
    assert payload["events_deleted"] is False

    missing_again = client.delete(f"/api/snapshot/{target_date}")
    assert missing_again.status_code == 404


def test_read_endpoints_are_open(tmp_path: Path) -> None:
    """Read endpoints should remain accessible without authentication headers."""
    service, settings = _build_service(tmp_path=tmp_path, seed_names=["Alice"])
    client = _build_test_client(service, settings)

    response = client.get("/api/locations")
    assert response.status_code == 200
    assert "locations" in response.json()

    today = date.today().isoformat()
    day_export = client.get(f"/api/export/day/{today}")
    assert day_export.status_code == 200
    assert "attachment;" in day_export.headers.get("content-disposition", "")
    assert day_export.headers.get("content-type", "").startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

    range_export = client.get(f"/api/export/range?date_from={today}&date_to={today}")
    assert range_export.status_code == 200
    assert "attachment;" in range_export.headers.get("content-disposition", "")
    assert range_export.headers.get("content-type", "").startswith("application/zip")


def test_location_events_api_add_delete_and_snapshot_sync(tmp_path: Path) -> None:
    """Location-events API should support hard delete and keep today's snapshot state in sync."""
    service, settings = _build_service(tmp_path=tmp_path, seed_names=["Alice"])
    client = _build_test_client(service, settings)

    today_payload = client.get("/api/snapshot/today").json()
    person = today_payload["people"][0]
    person_id = person["person_id"]
    default_location = person["location"]
    default_status = person["daily_status"]
    next_location = service.get_locations()[1]

    create_response = client.post(
        f"/api/people/{person_id}/location-events",
        json={"location": next_location, "daily_status": default_status},
    )
    assert create_response.status_code == 200
    create_payload = create_response.json()
    assert create_payload["person_id"] == person_id
    assert len(create_payload["events"]) == 1
    created_event = create_payload["events"][0]
    event_id = created_event["event_id"]
    assert created_event["event_type"] == "move"
    assert create_payload["last_action_type"] == "move"
    assert create_payload["last_action_event_id"] == event_id

    snapshot_after_add = client.get("/api/snapshot/today").json()
    updated_person = next(item for item in snapshot_after_add["people"] if item["person_id"] == person_id)
    assert updated_person["location"] == next_location

    read_response = client.get(f"/api/people/{person_id}/location-events")
    assert read_response.status_code == 200
    assert read_response.json()["events"][0]["event_id"] == event_id

    transitions_response = client.get(f"/api/people/{person_id}/transitions")
    assert transitions_response.status_code == 200
    assert transitions_response.json()["transitions"] == []

    delete_response = client.delete(f"/api/people/{person_id}/location-events/{event_id}")
    assert delete_response.status_code == 200
    delete_payload = delete_response.json()
    assert delete_payload["events"] == []

    active_only_response = client.get(
        f"/api/people/{person_id}/location-events?include_voided=false"
    )
    assert active_only_response.status_code == 200
    assert active_only_response.json()["events"] == []

    snapshot_after_delete = client.get("/api/snapshot/today").json()
    reverted_person = next(item for item in snapshot_after_delete["people"] if item["person_id"] == person_id)
    assert reverted_person["location"] == default_location
    assert reverted_person["daily_status"] == default_status


def test_transitions_api_includes_transition_source(tmp_path: Path) -> None:
    """GET /api/people/{person_id}/transitions should expose transition source metadata."""
    service, settings = _build_service(tmp_path=tmp_path, seed_names=["Alice"])
    client = _build_test_client(service, settings)

    today_payload = client.get("/api/snapshot/today").json()
    person_id = today_payload["people"][0]["person_id"]
    status_value = today_payload["people"][0]["daily_status"]
    locations = service.get_locations()

    first_create = client.post(
        f"/api/people/{person_id}/location-events",
        json={"location": locations[1], "daily_status": status_value},
    )
    assert first_create.status_code == 200

    second_create = client.post(
        f"/api/people/{person_id}/location-events",
        json={"location": locations[2], "daily_status": status_value},
    )
    assert second_create.status_code == 200

    transitions_response = client.get(f"/api/people/{person_id}/transitions")
    assert transitions_response.status_code == 200
    transitions = transitions_response.json()["transitions"]
    assert len(transitions) == 1
    assert transitions[0]["transition_source"] == "ui"
    assert transitions[0]["transition_source_raw"] == "manual_ui"


def test_self_report_api_creates_tracking_events_and_transition(tmp_path: Path) -> None:
    """POST /api/self-report should create tracking events that appear in timeline/transitions."""
    service, settings = _build_service(tmp_path=tmp_path, seed_names=["Alice"])
    client = _build_test_client(service, settings)

    today_payload = client.get("/api/snapshot/today").json()
    person = today_payload["people"][0]
    person_id = person["person_id"]
    person_name = person["full_name"]
    locations = service.get_locations()

    first_self_report = client.post(
        "/api/self-report",
        json={
            "person_lookup": person_name,
            "self_location": locations[1],
            "self_daily_status": "תקין",
        },
    )
    assert first_self_report.status_code == 200

    second_self_report = client.post(
        "/api/self-report",
        json={
            "person_lookup": person_name,
            "self_location": locations[3],
            "self_daily_status": "לא תקין",
        },
    )
    assert second_self_report.status_code == 200

    events_response = client.get(f"/api/people/{person_id}/location-events")
    assert events_response.status_code == 200
    events = events_response.json()["events"]
    assert len(events) == 2
    assert events[0]["source"] == "self_report_api"
    assert events[1]["source"] == "self_report_api"

    transitions_response = client.get(f"/api/people/{person_id}/transitions")
    assert transitions_response.status_code == 200
    transitions = transitions_response.json()["transitions"]
    assert len(transitions) == 1
    assert transitions[0]["transition_source"] == "bot"
    assert transitions[0]["transition_source_raw"] == "self_report_api"

    latest_event_id = events[0]["event_id"]
    delete_response = client.delete(f"/api/people/{person_id}/location-events/{latest_event_id}")
    assert delete_response.status_code == 200

    transitions_after_delete = client.get(f"/api/people/{person_id}/transitions")
    assert transitions_after_delete.status_code == 200
    assert transitions_after_delete.json()["transitions"] == []
