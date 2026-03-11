param(
    [int]$BackendPort = 8000
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$nginxDir = Join-Path $projectRoot "nginx-1.28.2"
$nginxExe = Join-Path $nginxDir "nginx.exe"

# Stop backend uvicorn process started for this app/port.
$backendProcesses = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -like "*uvicorn app.main:app*" -and
    $_.CommandLine -like "*--port $BackendPort*"
}

if ($backendProcesses) {
    foreach ($proc in $backendProcesses) {
        try {
            Stop-Process -Id $proc.ProcessId -Force
            Write-Host "Stopped backend process PID=$($proc.ProcessId)"
        }
        catch {
            if ($_.Exception.Message -like "*Cannot find a process*") {
                continue
            }
            Write-Warning "Failed to stop backend PID=$($proc.ProcessId): $($_.Exception.Message)"
        }
    }
}
else {
    Write-Host "No backend process found for port $BackendPort."
}

# Stop nginx gracefully if available.
if (Test-Path $nginxExe) {
    try {
        # Use graceful quit when nginx is running and pid file is sane.
        $nginxProcesses = Get-Process nginx -ErrorAction SilentlyContinue | Where-Object {
            $_.Path -eq $nginxExe
        }
        if ($nginxProcesses) {
            $nginxPidFile = Join-Path $nginxDir "logs\nginx.pid"
            $canUseQuitSignal = $false
            if (Test-Path $nginxPidFile) {
                $pidText = (Get-Content -Raw $nginxPidFile).Trim()
                if ($pidText -match '^\d+$') {
                    $canUseQuitSignal = $true
                }
            }

            if ($canUseQuitSignal) {
                & $nginxExe -p $nginxDir -c "conf/nginx.conf" -s quit
                Write-Host "Sent graceful stop signal to nginx."
                Start-Sleep -Milliseconds 500
                $stillRunning = Get-Process nginx -ErrorAction SilentlyContinue | Where-Object {
                    $_.Path -eq $nginxExe
                }
                if ($stillRunning) {
                    foreach ($proc in $stillRunning) {
                        Stop-Process -Id $proc.Id -Force
                        Write-Host "Force-stopped nginx process PID=$($proc.Id)"
                    }
                }
            }
            else {
                foreach ($proc in $nginxProcesses) {
                    Stop-Process -Id $proc.Id -Force
                    Write-Host "Stopped nginx process PID=$($proc.Id)"
                }
            }
        }
        else {
            Write-Host "No nginx process found."
        }
    }
    catch {
        Write-Warning "Failed to stop nginx: $($_.Exception.Message)"
    }
}
else {
    Write-Warning "nginx.exe was not found at: $nginxExe"
}
