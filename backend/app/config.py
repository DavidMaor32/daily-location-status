from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


BASE_DIR = Path(__file__).resolve().parents[2]
DEFAULT_APP_CONFIG_PATH = BASE_DIR / "config" / "app_config.yaml"
logger = logging.getLogger(__name__)
DEFAULT_ENV_PATH = BASE_DIR / ".env"


def _load_local_env_file(env_path: Path | None = None) -> None:
    """
    Load KEY=VALUE pairs from local .env file into process environment.

    Existing environment variables are not overwritten.
    This keeps secrets out of YAML files tracked in git.
    """
    resolved_env_path = env_path or DEFAULT_ENV_PATH
    if not resolved_env_path.exists():
        return

    for raw_line in resolved_env_path.read_text(encoding="utf-8").splitlines():
        # Handle UTF-8 BOM and optional "export KEY=VALUE" syntax.
        line = raw_line.lstrip("\ufeff").strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, raw_value = line.split("=", 1)
        key = key.strip().removeprefix("export ").strip()
        if not key:
            continue

        value = raw_value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]

        os.environ.setdefault(key, value)


def _resolve_path(raw_value: str | None, default_path: Path) -> Path:
    """Resolve relative paths against project root for stable behavior."""
    candidate = Path(raw_value).expanduser() if raw_value else default_path
    if not candidate.is_absolute():
        candidate = BASE_DIR / candidate
    return candidate


def _load_yaml_config(config_path: Path) -> dict[str, Any]:
    """Load YAML configuration file from disk."""
    if not config_path.exists():
        raise ValueError(
            f"YAML config file was not found: {config_path}. "
            "Create config/app_config.yaml before starting the backend."
        )

    try:
        raw_text = config_path.read_text(encoding="utf-8")
        parsed = yaml.safe_load(raw_text) or {}
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"Failed reading YAML config file: {config_path}") from exc

    if not isinstance(parsed, dict):
        raise ValueError(f"YAML config must contain an object at root: {config_path}")

    logger.info("Loaded YAML config from %s", config_path)
    return parsed


def _yaml_get(config_data: dict[str, Any], path: str, default: Any = None) -> Any:
    """Read nested YAML value by dot path (example: storage.s3.bucket_name)."""
    current: Any = config_data
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return default
        current = current[part]
    return current


def _parse_bool(raw_value: Any, default: bool = False) -> bool:
    """Parse bool-like values such as true/1/yes/on."""
    if raw_value is None:
        return default
    if isinstance(raw_value, bool):
        return raw_value
    return str(raw_value).strip().lower() in {"1", "true", "yes", "on"}


def _parse_int_list(raw_value: Any) -> list[int]:
    """Parse int list from YAML values (list or comma-separated string)."""
    if not raw_value:
        return []

    if isinstance(raw_value, list):
        items = raw_value
    else:
        items = str(raw_value).split(",")

    parsed: list[int] = []
    for item in items:
        cleaned = str(item).strip()
        if not cleaned:
            continue
        try:
            parsed.append(int(cleaned))
        except ValueError:
            continue
    return parsed


def _parse_str_list(raw_value: Any) -> list[str]:
    """Parse string list from YAML values (list or comma-separated string)."""
    if not raw_value:
        return []

    if isinstance(raw_value, list):
        items = raw_value
    else:
        items = str(raw_value).split(",")

    parsed: list[str] = []
    for item in items:
        cleaned = str(item).strip()
        if not cleaned:
            continue
        parsed.append(cleaned)
    return parsed


def _parse_positive_int(raw_value: Any, default: int, minimum: int = 1) -> int:
    """Parse positive integer value with fallback and lower bound."""
    if raw_value is None or str(raw_value).strip() == "":
        return max(minimum, default)
    try:
        parsed = int(raw_value)
    except ValueError:
        return max(minimum, default)
    return max(minimum, parsed)


def _parse_origins(raw_value: Any) -> list[str]:
    """Parse CORS origins from list or comma-separated string."""
    if raw_value is None:
        return ["http://localhost:5173"]
    if isinstance(raw_value, list):
        return [str(item).strip() for item in raw_value if str(item).strip()]
    return [origin.strip() for origin in str(raw_value).split(",") if origin.strip()]


def _parse_string(raw_value: Any, default: str) -> str:
    """Parse one required string with fallback when value is empty/null."""
    if raw_value is None:
        return default
    cleaned = str(raw_value).strip()
    return cleaned or default


def _parse_optional_string(raw_value: Any) -> str | None:
    """Parse one optional string and return None for empty/null values."""
    if raw_value is None:
        return None
    cleaned = str(raw_value).strip()
    return cleaned or None


def _parse_choice(raw_value: Any, default: str, allowed: set[str]) -> str:
    """Parse one string choice and validate against allowed values."""
    candidate = _parse_string(raw_value, default).lower()
    if candidate not in allowed:
        allowed_list = ", ".join(sorted(allowed))
        raise ValueError(f"Invalid config value '{candidate}'. Allowed values: {allowed_list}")
    return candidate


@dataclass
class Settings:
    config_file_path: Path
    app_name: str
    environment: str
    storage_mode: str
    aws_access_key_id: str | None
    aws_secret_access_key: str | None
    aws_session_token: str | None
    aws_region_name: str
    s3_bucket_name: str | None
    s3_snapshots_prefix: str
    s3_master_key: str
    s3_locations_key: str
    snapshot_restore_policy: str
    local_storage_dir: Path
    seed_people_file: Path
    cors_origins: list[str]
    write_api_key: str | None
    telegram_bot_enabled: bool
    telegram_bot_token: str | None
    telegram_allowed_chat_ids: list[int]
    telegram_allowed_remote_names: list[str]
    telegram_poll_timeout_seconds: int
    telegram_poll_retry_seconds: int

    @classmethod
    def from_yaml(cls) -> "Settings":
        """Build Settings from YAML config file only."""
        _load_local_env_file()
        config_path = DEFAULT_APP_CONFIG_PATH
        config_data = _load_yaml_config(config_path)

        cors_origins = _parse_origins(
            _yaml_get(config_data, "cors.origins", ["http://localhost:5173"])
        )

        return cls(
            config_file_path=config_path,
            app_name=_parse_string(_yaml_get(config_data, "app.name"), "Daily Status Manager API"),
            environment=_parse_string(_yaml_get(config_data, "app.environment"), "development"),
            storage_mode=_parse_choice(
                _yaml_get(config_data, "storage.mode"),
                "local",
                {"local", "s3", "local_and_s3", "dual", "hybrid"},
            ),
            aws_access_key_id=_parse_optional_string(_yaml_get(config_data, "aws.access_key_id")),
            aws_secret_access_key=_parse_optional_string(_yaml_get(config_data, "aws.secret_access_key")),
            aws_session_token=_parse_optional_string(_yaml_get(config_data, "aws.session_token")),
            aws_region_name=_parse_string(_yaml_get(config_data, "aws.region"), "us-east-1"),
            s3_bucket_name=_parse_optional_string(_yaml_get(config_data, "storage.s3.bucket_name")),
            s3_snapshots_prefix=_parse_string(
                _yaml_get(config_data, "storage.s3.snapshots_prefix"),
                "snapshots",
            ),
            s3_master_key=_parse_string(
                _yaml_get(config_data, "storage.s3.master_key"),
                "master/people_master.xlsx",
            ),
            s3_locations_key=_parse_string(
                _yaml_get(config_data, "storage.s3.locations_key"),
                "master/locations.xlsx",
            ),
            snapshot_restore_policy=_parse_choice(
                _yaml_get(config_data, "storage.snapshot_restore_policy"),
                "exact_snapshot",
                {"exact_snapshot", "master_only"},
            ),
            local_storage_dir=_resolve_path(
                _parse_optional_string(_yaml_get(config_data, "storage.local_storage_dir")),
                BASE_DIR / "local_storage",
            ),
            seed_people_file=_resolve_path(
                _parse_optional_string(_yaml_get(config_data, "storage.seed_people_file")),
                BASE_DIR / "backend" / "data" / "sample_people.xlsx",
            ),
            cors_origins=cors_origins,
            write_api_key=_parse_optional_string(os.getenv("WRITE_API_KEY"))
            or _parse_optional_string(_yaml_get(config_data, "security.write_api_key")),
            telegram_bot_enabled=_parse_bool(
                _yaml_get(config_data, "telegram.enabled", False),
                default=False,
            ),
            telegram_bot_token=_parse_optional_string(
                os.getenv("TELEGRAM_BOT_TOKEN")
            )
            or _parse_optional_string(_yaml_get(config_data, "telegram.bot_token")),
            telegram_allowed_chat_ids=_parse_int_list(
                _yaml_get(config_data, "telegram.allowed_chat_ids", [])
            ),
            telegram_allowed_remote_names=_parse_str_list(
                _yaml_get(config_data, "telegram.allowed_remote_names", [])
            ),
            telegram_poll_timeout_seconds=_parse_positive_int(
                _yaml_get(config_data, "telegram.poll_timeout_seconds", 25),
                default=25,
                minimum=5,
            ),
            telegram_poll_retry_seconds=_parse_positive_int(
                _yaml_get(config_data, "telegram.poll_retry_seconds", 3),
                default=3,
                minimum=1,
            ),
        )
