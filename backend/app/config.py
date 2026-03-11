from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parents[2]

# Load environment variables from project root and backend folder.
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR / "backend" / ".env")


def _resolve_env_path(raw_value: str, default_path: Path) -> Path:
    """Resolve relative env paths against project root for stable behavior."""
    candidate = Path(raw_value).expanduser() if raw_value else default_path
    if not candidate.is_absolute():
        candidate = BASE_DIR / candidate
    return candidate


@dataclass
class Settings:
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
    local_storage_dir: Path
    seed_people_file: Path
    cors_origins: list[str]

    @classmethod
    def from_env(cls) -> "Settings":
        """Build Settings object from environment variables."""
        raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173")
        cors_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

        return cls(
            app_name=os.getenv("APP_NAME", "Daily Status Manager API"),
            environment=os.getenv("ENVIRONMENT", "development"),
            storage_mode=os.getenv("STORAGE_MODE", "local").lower(),
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            aws_session_token=os.getenv("AWS_SESSION_TOKEN"),
            aws_region_name=os.getenv("AWS_REGION", "us-east-1"),
            s3_bucket_name=os.getenv("S3_BUCKET_NAME"),
            s3_snapshots_prefix=os.getenv("S3_SNAPSHOTS_PREFIX", "snapshots"),
            s3_master_key=os.getenv("S3_MASTER_KEY", "master/people_master.xlsx"),
            s3_locations_key=os.getenv("S3_LOCATIONS_KEY", "master/locations.xlsx"),
            local_storage_dir=_resolve_env_path(
                os.getenv("LOCAL_STORAGE_DIR", ""),
                BASE_DIR / "local_storage",
            ),
            seed_people_file=_resolve_env_path(
                os.getenv("SEED_PEOPLE_FILE", ""),
                BASE_DIR / "backend" / "data" / "sample_people.csv",
            ),
            cors_origins=cors_origins,
        )
