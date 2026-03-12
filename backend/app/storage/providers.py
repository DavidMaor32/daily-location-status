from __future__ import annotations

import logging
import os
import tempfile
import time
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

from app.config import Settings
from app.exceptions import StorageError
from app.storage.base import StorageProvider


logger = logging.getLogger(__name__)


class LocalStorageProvider(StorageProvider):
    """Simple local filesystem storage used for development and offline mode."""

    def __init__(self, root_dir: Path) -> None:
        """Initialize local storage root directory."""
        self.root_dir = root_dir
        self.root_dir.mkdir(parents=True, exist_ok=True)

    def _resolve(self, key: str, create_parent: bool = False) -> Path:
        """Resolve safe absolute path under storage root (optionally creates parent folder)."""
        safe_key = key.replace("..", "").lstrip("/\\")
        target_path = (self.root_dir / safe_key).resolve()

        # Guard against path traversal outside storage root.
        try:
            target_path.relative_to(self.root_dir.resolve())
        except ValueError:
            raise StorageError("Invalid storage key path")

        if create_parent:
            target_path.parent.mkdir(parents=True, exist_ok=True)

        return target_path

    def exists(self, key: str) -> bool:
        """Check whether object exists in local storage."""
        return self._resolve(key).exists()

    def read_bytes(self, key: str) -> bytes:
        """Read object bytes from local storage."""
        file_path = self._resolve(key)
        if not file_path.exists():
            raise StorageError(f"File not found: {key}")
        try:
            return file_path.read_bytes()
        except OSError as exc:
            raise StorageError(f"Failed reading local storage key: {key}") from exc

    def write_bytes(self, key: str, content: bytes) -> None:
        """
        Write object bytes into local storage atomically.

        File content is first written to a temp file under the same folder and
        then replaced in one operation, reducing risk of partial/corrupted files.
        """
        file_path = self._resolve(key, create_parent=True)
        temp_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="wb",
                delete=False,
                dir=str(file_path.parent),
                prefix=f".tmp-{file_path.name}-",
                suffix=".tmp",
            ) as temp_file:
                temp_file.write(content)
                temp_file.flush()
                os.fsync(temp_file.fileno())
                temp_path = Path(temp_file.name)
            os.replace(temp_path, file_path)
        except OSError as exc:
            raise StorageError(f"Failed writing local storage key: {key}") from exc
        finally:
            if temp_path is not None and temp_path.exists():
                try:
                    temp_path.unlink()
                except OSError:
                    pass

    def delete(self, key: str) -> bool:
        """Delete object key from local storage (returns False when key is missing)."""
        file_path = self._resolve(key)
        if not file_path.exists():
            return False
        try:
            file_path.unlink()
            return True
        except OSError as exc:
            raise StorageError(f"Failed deleting local storage key: {key}") from exc

    def list_keys(self, prefix: str) -> list[str]:
        """List object keys under a local prefix path."""
        base_path = self._resolve(prefix)
        if not base_path.exists():
            return []
        all_files = [p for p in base_path.rglob("*") if p.is_file()]
        return [str(p.relative_to(self.root_dir)).replace("\\", "/") for p in all_files]


class S3StorageProvider(StorageProvider):
    """AWS S3 storage backend for daily snapshot files."""

    def __init__(self, settings: Settings) -> None:
        """Initialize S3 client and target bucket."""
        if not settings.s3_bucket_name:
            raise StorageError("S3_BUCKET_NAME must be configured when STORAGE_MODE is 's3'")

        self.bucket = settings.s3_bucket_name
        self.client = boto3.client(
            "s3",
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_session_token=settings.aws_session_token,
            region_name=settings.aws_region_name,
        )

    def exists(self, key: str) -> bool:
        """Check whether an S3 object key exists."""
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError as exc:
            error_code = exc.response.get("Error", {}).get("Code", "")
            if error_code in {"404", "NoSuchKey", "NotFound"}:
                return False
            raise StorageError(f"S3 exists check failed for key {key}") from exc

    def read_bytes(self, key: str) -> bytes:
        """Read bytes from an S3 object key."""
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
            return response["Body"].read()
        except ClientError as exc:
            raise StorageError(f"Failed reading S3 key: {key}") from exc

    def write_bytes(self, key: str, content: bytes) -> None:
        """Write bytes into an S3 object key."""
        try:
            self.client.put_object(Bucket=self.bucket, Key=key, Body=content)
        except ClientError as exc:
            raise StorageError(f"Failed writing S3 key: {key}") from exc

    def delete(self, key: str) -> bool:
        """Delete object key from S3 (returns False when key is missing)."""
        exists = self.exists(key)
        if not exists:
            return False
        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError as exc:
            raise StorageError(f"Failed deleting S3 key: {key}") from exc

    def list_keys(self, prefix: str) -> list[str]:
        """List S3 object keys under a prefix."""
        try:
            paginator = self.client.get_paginator("list_objects_v2")
            pages = paginator.paginate(Bucket=self.bucket, Prefix=prefix)
            keys: list[str] = []
            for page in pages:
                for item in page.get("Contents", []):
                    key = item.get("Key")
                    if key:
                        keys.append(key)
            return keys
        except ClientError as exc:
            raise StorageError(f"Failed listing S3 keys under prefix: {prefix}") from exc


class MirroredStorageProvider(StorageProvider):
    """
    Dual storage provider.

    Primary storage is local filesystem.
    Mirror storage is S3.

    Reads prefer primary and fallback to mirror.
    Writes always persist to primary and then try mirror.
    """

    def __init__(self, primary: StorageProvider, mirror: StorageProvider) -> None:
        """Initialize mirrored provider with primary and mirror backends."""
        self.primary = primary
        self.mirror = mirror

    def exists(self, key: str) -> bool:
        """Check existence in primary first, then mirror."""
        if self.primary.exists(key):
            return True
        try:
            return self.mirror.exists(key)
        except StorageError as exc:
            logger.warning("Mirror exists check failed for key %s: %s", key, exc)
            return False

    def read_bytes(self, key: str) -> bytes:
        """
        Read bytes from primary.

        If key exists only in mirror, download from mirror and hydrate primary.
        """
        if self.primary.exists(key):
            return self.primary.read_bytes(key)

        if not self.mirror.exists(key):
            raise StorageError(f"File not found in primary or mirror storage: {key}")

        content = self.mirror.read_bytes(key)
        # Hydrate local cache so next reads are faster/offline-capable.
        self.primary.write_bytes(key, content)
        return content

    def write_bytes(self, key: str, content: bytes) -> None:
        """
        Write to primary and best-effort mirror.

        Local write is done first. Mirror write is retried and must succeed;
        otherwise the caller gets an error so inconsistency is visible.
        """
        self.primary.write_bytes(key, content)
        last_error: StorageError | None = None
        for attempt in range(2):
            try:
                self.mirror.write_bytes(key, content)
                return
            except StorageError as exc:
                last_error = exc
                logger.error(
                    "Mirror write failed for key %s (attempt %s/2): %s",
                    key,
                    attempt + 1,
                    exc,
                )
                if attempt == 0:
                    time.sleep(0.4)

        raise StorageError(
            f"Mirror write failed for key '{key}'. Local write succeeded but S3 sync failed."
        ) from last_error

    def delete(self, key: str) -> bool:
        """
        Delete key from both mirror and primary storage.

        Deleting mirror first prevents stale mirror objects from restoring deleted local keys.
        """
        primary_exists = self.primary.exists(key)
        try:
            mirror_exists = self.mirror.exists(key)
        except StorageError as exc:
            raise StorageError(f"Mirror exists check failed before delete for key: {key}") from exc

        if not primary_exists and not mirror_exists:
            return False

        # Delete mirror first, so missing primary will not be re-hydrated from stale mirror.
        if mirror_exists:
            self.mirror.delete(key)
        if primary_exists:
            self.primary.delete(key)
        return True

    def list_keys(self, prefix: str) -> list[str]:
        """Return union of keys from primary and mirror backends."""
        primary_keys = set(self.primary.list_keys(prefix))
        try:
            mirror_keys = set(self.mirror.list_keys(prefix))
        except StorageError as exc:
            logger.warning("Mirror list failed for prefix %s: %s", prefix, exc)
            mirror_keys = set()
        return sorted(primary_keys | mirror_keys)


def build_storage(settings: Settings) -> StorageProvider:
    """Factory to build storage provider from YAML configuration settings."""
    mode = settings.storage_mode.strip().lower()
    if mode == "s3":
        logger.info("Using S3 storage mode")
        return S3StorageProvider(settings)

    if mode in {"local_and_s3", "dual", "hybrid"}:
        logger.info("Using mirrored storage mode (local primary + S3 mirror)")
        local_provider = LocalStorageProvider(settings.local_storage_dir)
        s3_provider = S3StorageProvider(settings)
        return MirroredStorageProvider(primary=local_provider, mirror=s3_provider)

    if mode == "local":
        logger.info("Using local storage mode")
        return LocalStorageProvider(settings.local_storage_dir)

    raise StorageError(f"Unsupported storage mode: {mode}")
