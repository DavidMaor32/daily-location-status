"""Utility launcher for E2E tests: starts backend with isolated E2E config and storage."""

from __future__ import annotations

import os
import signal
import subprocess
import shutil
import sys
from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).resolve().parents[1]
E2E_CONFIG_PATH = REPO_ROOT / "config" / "app_config.e2e.yaml"
E2E_BACKEND_PORT = "39011"


def _is_within(parent: Path, child: Path) -> bool:
    """Return True when child path is under parent path."""
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


def _resolve_local_storage_dir(config_path: Path) -> Path:
    parsed = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    storage = parsed.get("storage") if isinstance(parsed, dict) else {}
    if not isinstance(storage, dict):
        return REPO_ROOT / "backend" / "e2e_storage"
    raw_dir = str(storage.get("local_storage_dir") or "./backend/e2e_storage")
    candidate = Path(raw_dir).expanduser()
    if not candidate.is_absolute():
        candidate = REPO_ROOT / candidate
    return candidate


def _validate_e2e_storage_dir(storage_dir: Path) -> Path:
    """
    Validate cleanup target to prevent accidental destructive deletion.

    Allowed targets must be inside `<repo>/backend` and the leaf folder
    name must include `e2e`.
    """
    resolved_repo = REPO_ROOT.resolve()
    resolved_backend = (REPO_ROOT / "backend").resolve()
    resolved_target = storage_dir.resolve()

    if not _is_within(resolved_repo, resolved_target):
        raise RuntimeError(
            f"Refusing to delete storage dir outside repository: {resolved_target}"
        )

    if not _is_within(resolved_backend, resolved_target):
        raise RuntimeError(
            f"Refusing to delete storage dir outside backend directory: {resolved_target}"
        )

    if "e2e" not in resolved_target.name.lower():
        raise RuntimeError(
            f"Refusing to delete non-e2e storage dir: {resolved_target}"
        )

    return resolved_target


def main() -> int:
    if not E2E_CONFIG_PATH.exists():
        raise FileNotFoundError(f"Missing E2E config file: {E2E_CONFIG_PATH}")

    storage_dir = _validate_e2e_storage_dir(_resolve_local_storage_dir(E2E_CONFIG_PATH))
    if storage_dir.exists():
        shutil.rmtree(storage_dir)
    storage_dir.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["APP_CONFIG_PATH"] = str(E2E_CONFIG_PATH)

    backend_dir = REPO_ROOT / "backend"
    command = [
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        E2E_BACKEND_PORT,
    ]
    process = subprocess.Popen(
        command,
        cwd=str(backend_dir),
        env=env,
    )

    def _forward_signal(sig: int, _frame) -> None:
        if process.poll() is None:
            process.send_signal(sig)

    signal.signal(signal.SIGINT, _forward_signal)
    signal.signal(signal.SIGTERM, _forward_signal)

    return process.wait()


if __name__ == "__main__":
    raise SystemExit(main())
