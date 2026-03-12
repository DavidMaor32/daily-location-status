"""Shared pytest fixtures and test wiring used by backend API/service test modules.

Responsibility: centralize reusable setup logic to keep tests consistent and isolated.
"""

from __future__ import annotations

import sys
from pathlib import Path


# Ensure `import app...` works regardless of pytest invocation directory.
BACKEND_DIR = Path(__file__).resolve().parents[1]
backend_path = str(BACKEND_DIR)
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)
