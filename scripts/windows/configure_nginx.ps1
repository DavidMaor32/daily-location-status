param(
    [int]$NginxPort = 80,
    [string]$BackendHost = "127.0.0.1",
    [int]$BackendPort = 8000
)

$ErrorActionPreference = "Stop"

# Resolve project paths from script location.
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$nginxDir = Join-Path $projectRoot "nginx-1.28.2"
$nginxExe = Join-Path $nginxDir "nginx.exe"
$nginxConfPath = Join-Path $nginxDir "conf\nginx.conf"
$frontendDist = Join-Path $projectRoot "frontend\dist"

if (!(Test-Path $nginxExe)) {
    throw "nginx.exe was not found at: $nginxExe"
}

if (!(Test-Path $frontendDist)) {
    throw "Frontend build folder was not found: $frontendDist. Run 'npm run build' in frontend first."
}

# Nginx on Windows works best with forward slashes in absolute paths.
$frontendRootForNginx = ($frontendDist -replace "\\", "/")

$template = @'
worker_processes  1;

events {
    worker_connections  1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile      on;
    keepalive_timeout  65;

    server {
        listen       __NGINX_PORT__;
        server_name  localhost;

        root   __FRONTEND_ROOT__;
        index  index.html;

        location /api/ {
            proxy_pass         http://__BACKEND_HOST__:__BACKEND_PORT__;
            proxy_http_version 1.1;
            proxy_set_header   Host $host;
            proxy_set_header   X-Real-IP $remote_addr;
            proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto $scheme;
            proxy_read_timeout 120s;
        }

        location / {
            try_files $uri $uri/ /index.html;
        }

        error_page   500 502 503 504  /50x.html;
        location = /50x.html {
            root   html;
        }
    }
}
'@

$nginxConfig = (
    $template.Replace("__NGINX_PORT__", [string]$NginxPort)
).Replace("__BACKEND_HOST__", $BackendHost
).Replace("__BACKEND_PORT__", [string]$BackendPort
).Replace("__FRONTEND_ROOT__", $frontendRootForNginx)

Set-Content -Path $nginxConfPath -Value $nginxConfig -Encoding Ascii

# Validate config syntax before running nginx.
& $nginxExe -t -p $nginxDir -c "conf/nginx.conf"

Write-Host "nginx.conf updated and validated:"
Write-Host "  Config:  $nginxConfPath"
Write-Host "  Front:   $frontendRootForNginx"
Write-Host "  API URL: http://$BackendHost`:$BackendPort"
Write-Host "  Nginx:   http://localhost:$NginxPort"
