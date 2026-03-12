"""Temporary backend boot + smoke-check script for critical API readiness validation."""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
HOST = "127.0.0.1"
PORT = int(os.getenv("SMOKE_BACKEND_PORT", "8011"))
STARTUP_TIMEOUT_SECONDS = 40


def request_json(
    method: str,
    path: str,
    *,
    headers: dict[str, str] | None = None,
    data: bytes | None = None,
) -> tuple[int, Any]:
    """Perform HTTP request and parse JSON response payload."""
    url = f"http://{HOST}:{PORT}{path}"
    request = urllib.request.Request(url=url, method=method, data=data)
    for key, value in (headers or {}).items():
        request.add_header(key, value)

    with urllib.request.urlopen(request, timeout=8) as response:  # noqa: S310
        status_code = int(response.status)
        body = response.read().decode("utf-8")
        return status_code, json.loads(body)


def wait_for_health() -> dict[str, Any]:
    """Wait until backend health endpoint is reachable or timeout expires."""
    last_error = ""
    deadline = time.time() + STARTUP_TIMEOUT_SECONDS
    while time.time() < deadline:
        try:
            status_code, payload = request_json("GET", "/api/health")
            if status_code == 200:
                return payload
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
        time.sleep(1)
    raise RuntimeError(f"Backend did not become healthy in time. Last error: {last_error}")


def run_smoke_checks() -> None:
    """Run smoke checks against critical endpoints."""
    health_payload = wait_for_health()
    if health_payload.get("status") != "ok" or not health_payload.get("startup_ok", False):
        raise RuntimeError(f"Health endpoint reported degraded startup: {health_payload}")

    status_code, today_payload = request_json("GET", "/api/snapshot/today")
    if status_code != 200:
        raise RuntimeError("GET /api/snapshot/today failed")
    if "people" not in today_payload or "date" not in today_payload:
        raise RuntimeError(f"Unexpected today snapshot payload: {today_payload}")

    target_date = date.today().isoformat()
    headers = {"Content-Type": "application/json"}

    try:
        save_status, save_payload = request_json(
            "POST",
            f"/api/snapshot/{target_date}/save",
            headers=headers,
            data=b"{}",
        )
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"POST /api/snapshot/{target_date}/save failed with HTTP {exc.code}: {body}"
        ) from exc

    if save_status != 200:
        raise RuntimeError("Manual save endpoint returned non-200 status")
    if str(save_payload.get("date")) != target_date:
        raise RuntimeError(f"Unexpected save response date: {save_payload}")
    if "rows_saved" not in save_payload:
        raise RuntimeError(f"Unexpected save response payload: {save_payload}")


def terminate_process(process: subprocess.Popen[str]) -> None:
    """Terminate backend process safely after smoke checks."""
    if process.poll() is not None:
        return

    if os.name == "nt":
        process.terminate()
    else:
        process.send_signal(signal.SIGTERM)

    try:
        process.wait(timeout=8)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def main() -> int:
    """Start backend temporarily, run smoke checks, and exit with status code."""
    command = [
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        HOST,
        "--port",
        str(PORT),
    ]
    process = subprocess.Popen(
        command,
        cwd=str(BACKEND_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    try:
        run_smoke_checks()
        print("Smoke test passed.")
        return 0
    except Exception as exc:  # noqa: BLE001
        terminate_process(process)
        output = ""
        try:
            if process.stdout is not None:
                output = process.stdout.read()
        except Exception:  # noqa: BLE001
            output = ""
        print(f"Smoke test failed: {exc}")
        if output.strip():
            print("Backend output:")
            print(output)
        return 1
    finally:
        terminate_process(process)


if __name__ == "__main__":
    raise SystemExit(main())
