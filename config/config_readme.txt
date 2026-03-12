CONFIG README
=============

Purpose
-------
`app_config.yaml` defines all non-secret runtime settings.
Use `.env` for secrets (for example: Telegram bot token).

Configuration file path:
  ./config/app_config.yaml


Field Reference
---------------
app.name
- Description: Logical service name used in logs and metadata.
- Example: "Daily Status Manager API"

app.environment
- Description: Runtime environment.
- Example: "development" or "production"

cors.origins
- Description: Browser origins allowed to call API endpoints (CORS).
- Example:
  - "http://localhost:5173"

frontend.api_base_url
- Description: API base URL used by the frontend.
- Recommended behavior: keep as empty string `""` to use relative `/api`.
- Example: ""

frontend.dev_server_port
- Description: Frontend dev server port (Vite).
- Example: 5173

frontend.dev_proxy_target
- Description: Target URL used by Vite to proxy `/api` requests in development.
- Example: "http://localhost:8000"

storage.mode
- Description: Excel storage mode.
- Allowed values:
  - local: local filesystem only
  - s3: S3 only
  - local_and_s3: local primary + S3 mirror
- Example: "local_and_s3"

storage.local_storage_dir
- Description: Local root folder for Excel files.
- Example: "./backend/local_storage"

storage.seed_people_file
- Description: Initial people seed file (prefer Excel), used only if master file does not yet exist.
- Example: "./backend/data/sample_people.xlsx"

storage.snapshot_restore_policy
- Description: Policy for restoring historical day into today.
- Allowed values:
  - exact_snapshot: restore exactly as historical file (including people removed from current master).
  - master_only: restore only currently active master people.
- Example: "exact_snapshot"

storage.s3.snapshots_prefix
- Description: S3 logical prefix for daily snapshot files.
- Example: "snapshots"

storage.s3.master_key
- Description: S3 key for people master Excel file.
- Example: "master/people_master.xlsx"

storage.s3.locations_key
- Description: S3 key for locations Excel file.
- Example: "master/locations.xlsx"

storage.s3.bucket_name
- Description: S3 bucket name.
- Required when: `storage.mode` is `s3` or `local_and_s3`.
- Example: "my-status-bucket"

aws.access_key_id
- Description: AWS access key ID.
- Example: "AKIA..."

aws.secret_access_key
- Description: AWS secret access key.
- Example: "xxxxxxxxxxxx"

aws.session_token
- Description: Temporary AWS session token (for temporary credentials).
- Example: "IQoJb3Jp..."

aws.region
- Description: AWS region for S3 calls.
- Example: "us-east-1"

telegram.enabled
- Description: Enable/disable Telegram bot integration.
- Values: true / false
- Example: true

telegram.bot_token
- Description: Bot token from BotFather (fallback source).
- Recommendation: keep empty in YAML and set `TELEGRAM_BOT_TOKEN` in `.env`.
- Example: "123456:ABC-DEF..."

telegram.allowed_chat_ids
- Description: Allowed Telegram chat IDs for bot updates.
- Behavior: empty list means no chat ID restriction.
- Example: [123456789, 987654321]

telegram.allowed_remote_names
- Description: Allowed names for conversational remote self-report.
- Behavior:
  - Empty list: no name restriction, user can type any name (new person can be auto-created).
  - Non-empty list: only listed names are allowed.
- Example: ["Yossi Cohen", "Michal Levi"]

telegram.poll_timeout_seconds
- Description: Telegram polling timeout in seconds.
- Example: 25

telegram.poll_retry_seconds
- Description: Delay between polling retries after failures.
- Example: 3


Quick example: local-only mode
------------------------------
storage:
  mode: "local"
  local_storage_dir: "./backend/local_storage"

frontend:
  api_base_url: ""
  dev_server_port: 5173
  dev_proxy_target: "http://localhost:8000"


Quick example: dual write mode (local + S3)
-------------------------------------------
storage:
  mode: "local_and_s3"
  local_storage_dir: "./backend/local_storage"
  s3:
    bucket_name: "my-status-bucket"
    snapshots_prefix: "snapshots"
    master_key: "master/people_master.xlsx"
    locations_key: "master/locations.xlsx"

aws:
  access_key_id: "AKIA..."
  secret_access_key: "..."
  region: "us-east-1"


Important Notes
---------------
- Any change to `config/app_config.yaml` requires backend and frontend restart.
- Do not commit real secrets into files tracked by git.
