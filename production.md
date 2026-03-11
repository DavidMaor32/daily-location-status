# Production on Windows (FastAPI + React + Nginx)

This guide runs the app on Windows using your local `nginx-1.28.2` folder.

## 1. Prerequisites

1. Python 3.9+
2. Node.js 18+
3. PowerShell
4. Nginx extracted at:
   `C:\Users\avish\OneDrive\Desktop\app\nginx-1.28.2`

If your folder name is different (for example `ngin-1.28.2`), rename it or update the scripts.

## 2. Configuration

1. Update:
   `config/app_config.yaml`
2. Keep secrets in:
   `.env`

Example `.env`:

```env
TELEGRAM_BOT_TOKEN=PUT_YOUR_TOKEN_HERE
```

## 3. What was added

Windows production scripts were added:

1. `scripts/windows/configure_nginx.ps1`
   - Generates `nginx-1.28.2/conf/nginx.conf` for this project.
   - Serves `frontend/dist`.
   - Proxies `/api` to backend.
   - Runs `nginx -t` validation.

2. `scripts/windows/start_production.ps1`
   - Creates backend venv if missing.
   - Installs dependencies (optional skip).
   - Builds frontend (optional skip).
   - Starts backend on `127.0.0.1:8000` with `--workers 1`.
   - Starts or reloads Nginx.

3. `scripts/windows/stop_production.ps1`
   - Stops backend process for this app.
   - Sends graceful `quit` to Nginx.

## 4. First run

From project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\start_production.ps1
```

This runs install + build + backend + nginx.

## 5. Fast run (after first setup)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\start_production.ps1 -SkipInstall -SkipBuild
```

## 6. Stop all

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\stop_production.ps1
```

## 7. Ports

Default ports:

1. Backend: `8000`
2. Nginx: `80`

If port 80 is busy, use another nginx port:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\start_production.ps1 -NginxPort 8080 -SkipInstall
```

## 8. Health checks

1. Through nginx:
   `http://localhost`
   (or `http://localhost:8080` if you changed port)

2. Backend direct:
   `http://127.0.0.1:8000/api/health`

3. System status:
   `http://127.0.0.1:8000/api/system/status`

PowerShell checks:

```powershell
Invoke-WebRequest http://127.0.0.1:8000/api/health
Invoke-WebRequest http://localhost/
```

## 9. Manual nginx commands (optional)

```powershell
cd .\nginx-1.28.2
.\nginx.exe -t -p "$PWD" -c conf/nginx.conf
.\nginx.exe -p "$PWD" -c conf/nginx.conf
.\nginx.exe -p "$PWD" -c conf/nginx.conf -s reload
.\nginx.exe -p "$PWD" -c conf/nginx.conf -s quit
```

## 10. Production notes

1. Keep backend workers at `1` in current architecture (Excel + Telegram).
2. In production, Nginx serves `frontend/dist`, so `npm run dev` is not needed.
3. After frontend changes: run `npm run build`, then restart using `start_production.ps1`.
4. After YAML config changes: restart backend (`stop_production` then `start_production`).
