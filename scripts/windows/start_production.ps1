param(
    [int]$BackendPort = 8000,
    [int]$NginxPort = 80,
    [switch]$SkipInstall,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$backendDir = Join-Path $projectRoot "backend"
$frontendDir = Join-Path $projectRoot "frontend"
$nginxDir = Join-Path $projectRoot "nginx-1.28.2"
$nginxExe = Join-Path $nginxDir "nginx.exe"

if (!(Test-Path $nginxExe)) {
    throw "nginx.exe was not found at: $nginxExe"
}

# Ensure backend virtualenv exists.
$venvPython = Join-Path $backendDir ".venv\Scripts\python.exe"
if (!(Test-Path $venvPython)) {
    Write-Host "Creating backend virtual environment..."
    Push-Location $backendDir
    python -m venv .venv
    Pop-Location
}

$venvPython = Join-Path $backendDir ".venv\Scripts\python.exe"
if (!(Test-Path $venvPython)) {
    throw "Backend virtualenv python was not found: $venvPython"
}

if (-not $SkipInstall) {
    Write-Host "Installing backend requirements..."
    & $venvPython -m pip install --upgrade pip
    & $venvPython -m pip install -r (Join-Path $backendDir "requirements.txt")

    Write-Host "Installing frontend dependencies..."
    Push-Location $frontendDir
    npm ci
    Pop-Location
}

if (-not $SkipBuild) {
    Write-Host "Building frontend for production..."
    Push-Location $frontendDir
    npm run build
    Pop-Location
}

Write-Host "Generating and validating nginx config..."
& (Join-Path $projectRoot "scripts\windows\configure_nginx.ps1") `
    -NginxPort $NginxPort `
    -BackendHost "127.0.0.1" `
    -BackendPort $BackendPort

# Start backend only if it is not already running on the same uvicorn command.
$existingBackend = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -like "*uvicorn app.main:app*" -and $_.CommandLine -like "*--port $BackendPort*"
}

if ($existingBackend) {
    Write-Host "Backend already running on port $BackendPort."
}
else {
    Write-Host "Starting backend (uvicorn) on 127.0.0.1:$BackendPort ..."
    Start-Process `
        -FilePath $venvPython `
        -WorkingDirectory $backendDir `
        -ArgumentList @(
            "-m", "uvicorn", "app.main:app",
            "--host", "127.0.0.1",
            "--port", "$BackendPort",
            "--workers", "1"
        ) `
        -WindowStyle Minimized
}

# Start or reload nginx.
$nginxRunning = Get-Process nginx -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -eq $nginxExe
}
if ($nginxRunning) {
    Write-Host "Reloading nginx..."
    & $nginxExe -p $nginxDir -c "conf/nginx.conf" -s reload
}
else {
    Write-Host "Starting nginx..."
    # Start nginx detached via cmd/start on Windows to avoid blocking this script.
    Start-Process `
        -FilePath "cmd.exe" `
        -ArgumentList @(
            "/c",
            "start",
            '""',
            "/b",
            "`"$nginxExe`"",
            "-p",
            "`"$nginxDir`"",
            "-c",
            "conf/nginx.conf"
        ) `
        -WorkingDirectory $nginxDir | Out-Null
}

Write-Host ""
Write-Host "Production stack is up:"
Write-Host "  Frontend + API proxy: http://localhost:$NginxPort"
Write-Host "  Backend direct:        http://127.0.0.1:$BackendPort/api/health"
Write-Host ""
Write-Host "Stop command:"
Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\windows\stop_production.ps1 -BackendPort $BackendPort"
