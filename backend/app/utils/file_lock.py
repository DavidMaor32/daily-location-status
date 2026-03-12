"""File lock utility for safe concurrent access to local storage files.

Responsibility: serialize critical read/write sections to prevent data corruption.
"""

from __future__ import annotations

import os
import time
from contextlib import contextmanager
from pathlib import Path


if os.name == "nt":
    import msvcrt
else:
    import fcntl


class ProcessFileLock:
    """
    Cross-process file lock for single-host coordination.

    Uses `fcntl.flock` on POSIX and `msvcrt.locking` on Windows.
    """

    def __init__(self, lock_path: Path) -> None:
        self.lock_path = lock_path
        self._file = None

    def acquire(
        self,
        *,
        blocking: bool = True,
        timeout_seconds: float | None = None,
        poll_interval_seconds: float = 0.1,
    ) -> bool:
        """Acquire lock. Returns False only for non-blocking/timeout acquisition failure."""
        if self._file is not None:
            return True

        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        start = time.monotonic()
        while True:
            lock_file = self.lock_path.open("a+b")
            try:
                lock_file.seek(0, os.SEEK_END)
                if lock_file.tell() == 0:
                    lock_file.write(b"\0")
                    lock_file.flush()
                lock_file.seek(0)

                got_lock = self._try_lock(lock_file, blocking=False)
                if got_lock:
                    self._file = lock_file
                    return True
            except OSError as exc:
                if not self._is_contention_error(exc):
                    lock_file.close()
                    raise
            finally:
                if self._file is None:
                    lock_file.close()

            if not blocking:
                return False

            if timeout_seconds is not None and (time.monotonic() - start) >= timeout_seconds:
                return False

            time.sleep(max(0.01, poll_interval_seconds))

    def release(self) -> None:
        """Release lock if currently held."""
        if self._file is None:
            return

        try:
            self._unlock(self._file)
        finally:
            self._file.close()
            self._file = None

    @contextmanager
    def locked(
        self,
        *,
        timeout_seconds: float | None = None,
        poll_interval_seconds: float = 0.1,
    ):
        """Context manager for blocking lock acquisition."""
        acquired = self.acquire(
            blocking=True,
            timeout_seconds=timeout_seconds,
            poll_interval_seconds=poll_interval_seconds,
        )
        if not acquired:
            raise TimeoutError(f"Timed out acquiring lock: {self.lock_path}")
        try:
            yield
        finally:
            self.release()

    def _try_lock(self, lock_file, *, blocking: bool) -> bool:
        """Try lock once. Returns False on contention."""
        if os.name == "nt":
            mode = msvcrt.LK_LOCK if blocking else msvcrt.LK_NBLCK
            try:
                lock_file.seek(0)
                msvcrt.locking(lock_file.fileno(), mode, 1)
                return True
            except OSError as exc:
                if self._is_contention_error(exc):
                    return False
                raise

        lock_flags = fcntl.LOCK_EX
        if not blocking:
            lock_flags |= fcntl.LOCK_NB
        try:
            fcntl.flock(lock_file.fileno(), lock_flags)
            return True
        except BlockingIOError:
            return False
        except OSError as exc:
            if self._is_contention_error(exc):
                return False
            raise

    def _unlock(self, lock_file) -> None:
        """Unlock file handle."""
        if os.name == "nt":
            lock_file.seek(0)
            msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
            return
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)

    def _is_contention_error(self, exc: OSError) -> bool:
        """Return True when OS error indicates lock contention/busy file."""
        winerror = getattr(exc, "winerror", None)
        if winerror in {32, 33, 36}:
            return True
        return getattr(exc, "errno", None) in {11, 13}
