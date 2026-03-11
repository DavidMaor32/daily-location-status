# Quick Run Instructions

This project is configured from a single YAML file:

- `config/app_config.yaml`

For secrets (for example Telegram token), use `.env`.

## 1) Requirements

- Python 3.9+
- Node.js 18+
- npm

## 2) Check Configuration

Edit:

- `config/app_config.yaml`

Recommended local-development values:

- `storage.mode: "local"`
- `storage.snapshot_restore_policy: "exact_snapshot"`
- `frontend.api_base_url: ""`
- `frontend.dev_server_port: 5173`
- `frontend.dev_proxy_target: "http://localhost:8000"`

Optional `.env`:

- `TELEGRAM_BOT_TOKEN=YOUR_TOKEN`

## 3) Run Backend (Terminal 1)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Health endpoint:

- `http://localhost:8000/api/health`

## 4) Run Frontend (Terminal 2)

```powershell
cd frontend
npm install
npm run dev
```

Open app:

- `http://localhost:5173`

## 5) Telegram Bot (Optional)

Enable in `config/app_config.yaml`:

- `telegram.enabled: true`
- `telegram.bot_token: ""` (recommended to keep empty)
- `telegram.allowed_remote_names: []` (empty list = no name restriction)

Store token in `.env`:

- `TELEGRAM_BOT_TOKEN=YOUR_TOKEN`

Conversation flow:

1. `/start`
2. choose name
3. choose location
4. choose status (`תקין` / `לא תקין`)
5. bot returns success/failure result

Website daily status supports three values:

- `תקין`
- `לא תקין`
- `לא הוזן` (default for new person)

If bot is disabled:

- Website still works normally.
- Self-report columns remain empty.

## 6) Initial People List (No Need to Re-enter Daily)

In the main screen use **Initial Names List**:

1. Paste names (one per line or comma-separated).
2. Click the add-list button.
3. System adds only missing names and skips existing names.

Result:

- Names are stored in master (`people_master.xlsx`).
- New daily snapshots are auto-built from master.

## 7) Common Issues

### Backend does not start

- Ensure venv is active:
  - `.\.venv\Scripts\Activate.ps1`
- Ensure dependencies are installed:
  - `pip install -r requirements.txt`

### Frontend cannot reach backend

Check `config/app_config.yaml`:

- `frontend.api_base_url: ""`
- `frontend.dev_proxy_target: "http://localhost:8000"`

### Config changes do not apply

After changing `config/app_config.yaml`, restart both backend and frontend.
