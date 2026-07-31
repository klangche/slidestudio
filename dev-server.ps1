# SlideStudio dev server
# Serves the project on localhost so Service Worker / PWA features work (file:// blocks them)
param(
    [int]$Port = 8000
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$url  = "http://localhost:$Port/index.html"

# 1. Check that Python is available (used for the static server)
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Host "ERROR: Python is required but not found. Install it from https://www.python.org/downloads/" -ForegroundColor Red
    exit 1
}

# 2. Check that the port is free
$inUse = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($inUse) {
    Write-Host "ERROR: Port $Port is already in use. Run again with a different port, e.g.:" -ForegroundColor Red
    Write-Host "  powershell -File dev-server.ps1 -Port 8080" -ForegroundColor Yellow
    exit 1
}

# 3. Open the app in the browser
Start-Process $url

Write-Host ""
Write-Host "  SlideStudio dev server" -ForegroundColor Cyan
Write-Host "  ----------------------" -ForegroundColor Cyan
Write-Host "  Serving:  $root" -ForegroundColor Green
Write-Host "  URL:      $url" -ForegroundColor Green
Write-Host ""
Write-Host "  PWA test checklist:" -ForegroundColor Yellow
Write-Host "    1. Open DevTools -> Application -> Service Workers" -ForegroundColor Yellow
Write-Host "       You should see 'sw.js' registered and activated." -ForegroundColor Yellow
Write-Host "    2. The 'Install App' button (bottom right) should appear." -ForegroundColor Yellow
Write-Host "    3. Reload the page once after the first load so the SW takes over." -ForegroundColor Yellow
Write-Host "    4. To test offline: DevTools -> Network -> tick 'Offline', then reload." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Stop the server with Ctrl+C" -ForegroundColor Gray
Write-Host ""

# 4. Serve the project root (required: sw.js is registered at '/sw.js')
& python -m http.server $Port --bind 127.0.0.1 --directory $root
