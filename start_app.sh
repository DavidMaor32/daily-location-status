#!/usr/bin/env bash
# App startup wrapper for Windows environments using Git Bash.
# Responsibility: provide a single command entrypoint for launching the app in production mode.

set -euo pipefail

# ------------------------------------------------------------
# File purpose:
# Cross-platform launcher for this project.
# - Dev mode: starts backend + frontend together.
# - Windows prod mode: delegates startup/stop to PowerShell scripts.
# - Includes prerequisite checks and optional auto-install on Windows.
# ------------------------------------------------------------
# cd C:\Users\avish\OneDrive\Desktop\app & "C:\Program Files\Git\bin\bash.exe" .\start_app.sh --prod

MODE="dev"
SKIP_INSTALL="false"
SKIP_PREREQ_CHECK="false"
SKIP_BUILD="false"
STOP_PROD="false"
PYTHON_BIN=""
POWERSHELL_CMD=""
MISSING_PYTHON=0
MISSING_NODE=0
MISSING_NPM=0
MISSING_POWERSHELL=0
declare -a MISSING_PREREQS=()

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
NGINX_PORT="${NGINX_PORT:-80}"
NGINX_DIR="${NGINX_DIR:-}"

print_usage() {
  cat <<EOF
Usage: ./start_app.sh [options]

Modes:
  --dev                 Start local backend + frontend dev stack (default)
  --prod                On Windows: run scripts/windows/start_production.ps1
                        On non-Windows: run local backend + frontend in prod-like mode
  --stop-prod           On Windows: run scripts/windows/stop_production.ps1 and exit

Options:
  --skip-install        Skip dependency installation
  --skip-prereq-check   Skip prerequisite checks (Python/Node/npm/PowerShell)
  --skip-build          (Windows prod only) Skip frontend build
  --backend-port <num>  Backend port (default: $BACKEND_PORT)
  --frontend-port <num> Frontend port for local mode (default: $FRONTEND_PORT)
  --nginx-port <num>    Nginx port for Windows prod script (default: $NGINX_PORT)
  --nginx-dir <path>    Nginx directory for Windows prod script
  --help                Show this message
EOF
}

is_windows_shell() {
  case "$(uname -s 2>/dev/null || echo unknown)" in
    MINGW*|MSYS*|CYGWIN*)
      return 0
      ;;
  esac
  [ "${OS:-}" = "Windows_NT" ]
}

to_windows_path_if_needed() {
  local input_path="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$input_path"
    return
  fi
  if command -v wslpath >/dev/null 2>&1 && [[ "$input_path" == /* ]]; then
    wslpath -w "$input_path"
    return
  fi
  echo "$input_path"
}

resolve_powershell_cmd() {
  if command -v powershell.exe >/dev/null 2>&1; then
    echo "powershell.exe"
    return
  fi
  if command -v powershell >/dev/null 2>&1; then
    echo "powershell"
    return
  fi
  if command -v pwsh >/dev/null 2>&1; then
    echo "pwsh"
    return
  fi
  return 1
}

resolve_winget_cmd() {
  if command -v winget.exe >/dev/null 2>&1; then
    echo "winget.exe"
    return
  fi
  if command -v winget >/dev/null 2>&1; then
    echo "winget"
    return
  fi
  return 1
}

validate_port() {
  local value="$1"
  local name="$2"
  if ! [[ "$value" =~ ^[0-9]+$ ]]; then
    echo "Invalid $name: $value (must be numeric)"
    exit 1
  fi
}

is_yes() {
  local answer
  answer="$(echo "${1:-}" | tr '[:upper:]' '[:lower:]' | xargs)"
  [ "$answer" = "y" ] || [ "$answer" = "yes" ]
}

add_missing_prereq() {
  MISSING_PREREQS+=("$1")
}

check_python_prereq() {
  local version=""
  local major=""
  local minor=""
  local found_any=0
  local last_reason=""
  local candidate=""
  local candidates=("python3" "python")

  for candidate in "${candidates[@]}"; do
    if ! command -v "$candidate" >/dev/null 2>&1; then
      continue
    fi
    found_any=1

    version="$("$candidate" -c 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")' 2>/dev/null || true)"
    major="${version%%.*}"
    minor="${version#*.}"
    minor="${minor%%.*}"

    if [[ ! "$major" =~ ^[0-9]+$ ]] || [[ ! "$minor" =~ ^[0-9]+$ ]]; then
      last_reason="Python 3.9+ (failed to read version from $candidate)"
      continue
    fi

    if [ "$major" -lt 3 ] || { [ "$major" -eq 3 ] && [ "$minor" -lt 9 ]; }; then
      last_reason="Python 3.9+ (found $candidate version $version)"
      continue
    fi

    PYTHON_BIN="$candidate"
    return
  done

  MISSING_PYTHON=1
  if [ "$found_any" -eq 0 ]; then
    add_missing_prereq "Python 3.9+ (not found in PATH)"
  elif [ -n "$last_reason" ]; then
    add_missing_prereq "$last_reason"
  else
    add_missing_prereq "Python 3.9+ (not usable from PATH)"
  fi
}

check_node_prereq() {
  local version=""
  local major=""

  if ! command -v node >/dev/null 2>&1; then
    MISSING_NODE=1
    add_missing_prereq "Node.js 18+ (not found in PATH)"
    return
  fi

  version="$(node -p "process.versions.node" 2>/dev/null || true)"
  major="${version%%.*}"
  if [[ ! "$major" =~ ^[0-9]+$ ]]; then
    MISSING_NODE=1
    add_missing_prereq "Node.js 18+ (failed to read version)"
    return
  fi

  if [ "$major" -lt 18 ]; then
    MISSING_NODE=1
    add_missing_prereq "Node.js 18+ (found version $version)"
  fi
}

check_npm_prereq() {
  if ! command -v npm >/dev/null 2>&1; then
    MISSING_NPM=1
    add_missing_prereq "npm (not found in PATH)"
  fi
}

check_powershell_prereq() {
  local resolved=""
  resolved="$(resolve_powershell_cmd 2>/dev/null || true)"
  if [ -z "$resolved" ]; then
    MISSING_POWERSHELL=1
    add_missing_prereq "PowerShell (powershell.exe/powershell/pwsh not found in PATH)"
    return
  fi
  POWERSHELL_CMD="$resolved"
}

scan_prerequisites() {
  MISSING_PYTHON=0
  MISSING_NODE=0
  MISSING_NPM=0
  MISSING_POWERSHELL=0
  MISSING_PREREQS=()
  PYTHON_BIN=""
  POWERSHELL_CMD=""

  check_python_prereq
  check_node_prereq
  check_npm_prereq
  check_powershell_prereq
}

print_missing_prerequisites() {
  echo "Missing or incompatible prerequisites detected:"
  for item in "${MISSING_PREREQS[@]}"; do
    echo "  - $item"
  done
  echo ""
}

print_windows_install_hints() {
  cat <<EOF
Recommended manual install commands (Windows, winget):
  winget install --id Python.Python.3.12 -e --source winget
  winget install --id OpenJS.NodeJS.LTS -e --source winget
  winget install --id Microsoft.PowerShell -e --source winget
EOF
}

install_missing_prerequisites_windows() {
  local winget_cmd="$1"
  local install_failed=0

  if [ "$MISSING_PYTHON" -eq 1 ]; then
    echo "Installing Python 3.9+..."
    if ! "$winget_cmd" install --id Python.Python.3.12 -e --source winget --accept-source-agreements --accept-package-agreements; then
      echo "Automatic install failed for Python."
      install_failed=1
    fi
  fi

  if [ "$MISSING_NODE" -eq 1 ] || [ "$MISSING_NPM" -eq 1 ]; then
    echo "Installing Node.js LTS (includes npm)..."
    if ! "$winget_cmd" install --id OpenJS.NodeJS.LTS -e --source winget --accept-source-agreements --accept-package-agreements; then
      echo "Automatic install failed for Node.js/npm."
      install_failed=1
    fi
  fi

  if [ "$MISSING_POWERSHELL" -eq 1 ]; then
    echo "Installing PowerShell..."
    if ! "$winget_cmd" install --id Microsoft.PowerShell -e --source winget --accept-source-agreements --accept-package-agreements; then
      echo "Automatic install failed for PowerShell."
      install_failed=1
    fi
  fi

  return "$install_failed"
}

ensure_prerequisites() {
  scan_prerequisites
  if [ "${#MISSING_PREREQS[@]}" -eq 0 ]; then
    return
  fi

  print_missing_prerequisites
  if ! is_windows_shell; then
    echo "Automatic prerequisite installation is supported by this script only on Windows."
    echo "Please install the missing tools manually and run again."
    exit 1
  fi

  local winget_cmd=""
  winget_cmd="$(resolve_winget_cmd 2>/dev/null || true)"
  if [ -z "$winget_cmd" ]; then
    echo "winget was not found, so automatic installation is unavailable."
    print_windows_install_hints
    exit 1
  fi

  echo "Recommendation: install missing prerequisites automatically now (via winget)."
  if [ ! -t 0 ]; then
    echo "Non-interactive shell detected; cannot prompt for confirmation."
    print_windows_install_hints
    exit 1
  fi

  local reply=""
  read -r -p "Install missing prerequisites now? [y/N]: " reply
  if ! is_yes "$reply"; then
    echo "Cancelled by user."
    print_windows_install_hints
    exit 1
  fi

  install_missing_prerequisites_windows "$winget_cmd" || {
    echo "Automatic installation finished with errors."
    print_windows_install_hints
    exit 1
  }

  # Refresh command hash and rescan.
  hash -r
  scan_prerequisites
  if [ "${#MISSING_PREREQS[@]}" -ne 0 ]; then
    echo "Some prerequisites are still missing after installation:"
    for item in "${MISSING_PREREQS[@]}"; do
      echo "  - $item"
    done
    echo ""
    echo "Close and reopen the terminal, then run the script again."
    exit 1
  fi
}

while (($#)); do
  case "$1" in
    --prod)
      MODE="prod"
      shift
      ;;
    --dev)
      MODE="dev"
      shift
      ;;
    --skip-install)
      SKIP_INSTALL="true"
      shift
      ;;
    --skip-prereq-check)
      SKIP_PREREQ_CHECK="true"
      shift
      ;;
    --skip-build)
      SKIP_BUILD="true"
      shift
      ;;
    --stop-prod)
      STOP_PROD="true"
      shift
      ;;
    --backend-port)
      if [ $# -lt 2 ]; then
        echo "Missing value for --backend-port"
        exit 1
      fi
      BACKEND_PORT="$2"
      shift 2
      ;;
    --frontend-port)
      if [ $# -lt 2 ]; then
        echo "Missing value for --frontend-port"
        exit 1
      fi
      FRONTEND_PORT="$2"
      shift 2
      ;;
    --nginx-port)
      if [ $# -lt 2 ]; then
        echo "Missing value for --nginx-port"
        exit 1
      fi
      NGINX_PORT="$2"
      shift 2
      ;;
    --nginx-dir)
      if [ $# -lt 2 ]; then
        echo "Missing value for --nginx-dir"
        exit 1
      fi
      NGINX_DIR="$2"
      shift 2
      ;;
    --help|-h)
      print_usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      print_usage
      exit 1
      ;;
  esac
done

validate_port "$BACKEND_PORT" "backend port"
validate_port "$FRONTEND_PORT" "frontend port"
validate_port "$NGINX_PORT" "nginx port"
if [ "$SKIP_PREREQ_CHECK" != "true" ]; then
  ensure_prerequisites
else
  echo "Skipping prerequisite checks (--skip-prereq-check)."
fi

run_windows_prod_start() {
  local ps_script="$ROOT_DIR/scripts/windows/start_production.ps1"
  if [ ! -f "$ps_script" ]; then
    echo "Missing script: $ps_script"
    exit 1
  fi

  local ps_cmd
  ps_cmd="$(resolve_powershell_cmd)" || {
    echo "PowerShell command was not found in PATH (powershell.exe/powershell/pwsh)."
    exit 1
  }

  local ps_script_path
  ps_script_path="$(to_windows_path_if_needed "$ps_script")"

  local args=(
    -ExecutionPolicy
    Bypass
    -File
    "$ps_script_path"
    -BackendPort
    "$BACKEND_PORT"
    -NginxPort
    "$NGINX_PORT"
  )
  if [ -n "$NGINX_DIR" ]; then
    args+=(-NginxDir "$NGINX_DIR")
  fi
  if [ "$SKIP_INSTALL" = "true" ]; then
    args+=(-SkipInstall)
  fi
  if [ "$SKIP_BUILD" = "true" ]; then
    args+=(-SkipBuild)
  fi

  echo "Delegating production startup to PowerShell script..."
  "$ps_cmd" "${args[@]}"
}

run_windows_prod_stop() {
  local ps_script="$ROOT_DIR/scripts/windows/stop_production.ps1"
  if [ ! -f "$ps_script" ]; then
    echo "Missing script: $ps_script"
    exit 1
  fi

  local ps_cmd
  ps_cmd="$(resolve_powershell_cmd)" || {
    echo "PowerShell command was not found in PATH (powershell.exe/powershell/pwsh)."
    exit 1
  }

  local ps_script_path
  ps_script_path="$(to_windows_path_if_needed "$ps_script")"

  echo "Delegating production stop to PowerShell script..."
  local args=(
    -ExecutionPolicy
    Bypass
    -File
    "$ps_script_path"
    -BackendPort
    "$BACKEND_PORT"
  )
  if [ -n "$NGINX_DIR" ]; then
    args+=(-NginxDir "$NGINX_DIR")
  fi
  "$ps_cmd" "${args[@]}"
}

if [ "$STOP_PROD" = "true" ]; then
  if is_windows_shell; then
    run_windows_prod_stop
    exit 0
  fi
  echo "--stop-prod is supported only on Windows."
  exit 1
fi

if [ "$MODE" = "prod" ] && is_windows_shell; then
  run_windows_prod_start
  exit 0
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
