#!/usr/bin/env bash
set -euo pipefail

# ------------------------------------------------------------
# Start backend + frontend together
# Default mode: development
# Optional mode: production
# ------------------------------------------------------------

MODE="dev"
SKIP_INSTALL="false"

for arg in "$@"; do
  case "$arg" in
    --prod)
      MODE="prod"
      ;;
    --dev)
      MODE="dev"
      ;;
    --skip-install)
      SKIP_INSTALL="true"
      ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: ./start_app.sh [--dev|--prod] [--skip-install]"
      exit 1
      ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
else
  echo "Python was not found in PATH"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found in PATH"
  exit 1
fi

if ! command -v bash >/dev/null 2>&1; then
  echo "bash was not found in PATH"
  exit 1
fi

if [ ! -d "$BACKEND_DIR" ] || [ ! -f "$BACKEND_DIR/requirements.txt" ]; then
  echo "Backend directory/requirements not found: $BACKEND_DIR"
  exit 1
fi

if [ ! -d "$FRONTEND_DIR" ] || [ ! -f "$FRONTEND_DIR/package.json" ]; then
  echo "Frontend directory/package.json not found: $FRONTEND_DIR"
  exit 1
fi

if [ ! -d "$BACKEND_DIR/.venv" ]; then
  echo "Creating backend virtualenv..."
  "$PYTHON_BIN" -m venv "$BACKEND_DIR/.venv"
fi

if [ -x "$BACKEND_DIR/.venv/bin/python" ]; then
  VENV_PYTHON="$BACKEND_DIR/.venv/bin/python"
  VENV_PIP="$BACKEND_DIR/.venv/bin/pip"
  VENV_UVICORN="$BACKEND_DIR/.venv/bin/uvicorn"
elif [ -x "$BACKEND_DIR/.venv/Scripts/python.exe" ]; then
  VENV_PYTHON="$BACKEND_DIR/.venv/Scripts/python.exe"
  VENV_PIP="$BACKEND_DIR/.venv/Scripts/pip.exe"
  VENV_UVICORN="$BACKEND_DIR/.venv/Scripts/uvicorn.exe"
else
  echo "Cannot find virtualenv executables under backend/.venv"
  exit 1
fi

if [ "$SKIP_INSTALL" != "true" ]; then
  echo "Installing backend dependencies..."
  "$VENV_PYTHON" -m pip install --upgrade pip
  "$VENV_PIP" install -r "$BACKEND_DIR/requirements.txt"

  echo "Installing frontend dependencies..."
  (cd "$FRONTEND_DIR" && npm install)
fi

cleanup() {
  echo ""
  echo "Stopping processes..."
  if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
  if [ -n "${FRONTEND_PID:-}" ] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi
  wait >/dev/null 2>&1 || true
}

trap cleanup INT TERM EXIT

echo "Starting backend ($MODE mode)..."
if [ "$MODE" = "prod" ]; then
  (
    cd "$BACKEND_DIR"
    exec "$VENV_UVICORN" app.main:app --host 0.0.0.0 --port "$BACKEND_PORT"
  ) &
else
  (
    cd "$BACKEND_DIR"
    exec "$VENV_UVICORN" app.main:app --reload --host 0.0.0.0 --port "$BACKEND_PORT"
  ) &
fi
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID (http://localhost:$BACKEND_PORT)"

echo "Starting frontend ($MODE mode)..."
if [ "$MODE" = "prod" ]; then
  (
    cd "$FRONTEND_DIR"
    if [ ! -d "dist" ]; then
      npm run build
    fi
    exec npm run preview -- --host 0.0.0.0 --port "$FRONTEND_PORT"
  ) &
else
  (
    cd "$FRONTEND_DIR"
    exec npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT"
  ) &
fi
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID (http://localhost:$FRONTEND_PORT)"

echo "Application is up. Press Ctrl+C to stop both processes."

# Exit when one process exits; cleanup trap will stop the other.
EXIT_CODE=0
while true; do
  if ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    wait "$BACKEND_PID" || EXIT_CODE=$?
    break
  fi
  if ! kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    wait "$FRONTEND_PID" || EXIT_CODE=$?
    break
  fi
  sleep 1
done

echo "One process exited (code $EXIT_CODE)."
exit "$EXIT_CODE"
