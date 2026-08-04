<#
.SYNOPSIS
    SlideStudio dev server - static files + live reload.

.DESCRIPTION
    Serves the project root over HTTP (needed for Service Worker / PWA
    features, which file:// blocks) and reloads the browser tab
    automatically whenever a project file changes - no manual refresh.

    The actual server is dev-server.py (Python standard library only,
    nothing to install).

.PARAMETER Port
    Port to listen on. Default 8000. If it is already in use, the next
    free port is picked automatically (unless -StrictPort).

.PARAMETER NoBrowser
    Do not open the browser after starting.

.PARAMETER NoReload
    Disable automatic live reload.

.PARAMETER NoAutoStop
    Keep the server running after the browser tab is closed.

.PARAMETER StrictPort
    Fail instead of silently switching to the next free port.

.EXAMPLE
    .\dev-server.ps1

.EXAMPLE
    .\dev-server.ps1 -Port 8080 -NoBrowser

#>
[CmdletBinding()]
param(
    [int]    $Port = 8000,
    [switch] $NoBrowser,
    [switch] $NoReload,
    [switch] $NoAutoStop,
    [switch] $StrictPort
)

$ErrorActionPreference = 'Stop'

$root       = $PSScriptRoot
$serverFile = Join-Path $root 'dev-server.py'

function Write-Step { param($Text) Write-Host "  $Text" -ForegroundColor DarkGray }
function Write-Bad  { param($Text) Write-Host "  $Text" -ForegroundColor Red }
function Get-FreePort {
    param([int]$Start)
    for ($i = $Start; $i -lt ($Start + 100); $i++) {
        if (-not (Get-NetTCPConnection -LocalPort $i -State Listen -ErrorAction SilentlyContinue)) {
            return $i
        }
    }
    return 0
}

Write-Host ""
Write-Host "  SlideStudio  -  Dev Server" -ForegroundColor Cyan
Write-Host "  ==========================" -ForegroundColor Cyan
Write-Host ""

# --- 1. Python ------------------------------------------------------------
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) {
    Write-Bad "Python was not found."
    Write-Host "  Install it from https://www.python.org/downloads/ and try again." -ForegroundColor Yellow
    exit 1
}
$pyVer = (& $py.Source --version 2>&1 | Out-String).Trim()
Write-Step "Python    $pyVer"

# --- 2. Server script ------------------------------------------------------
if (-not (Test-Path -LiteralPath $serverFile)) {
    Write-Bad "Missing $serverFile"
    Write-Host "  This script needs dev-server.py next to it." -ForegroundColor Yellow
    exit 1
}

# --- 3. Port ---------------------------------------------------------------
$listenPort = $Port
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    if ($StrictPort) {
        Write-Bad "Port $Port is already in use and -StrictPort was given."
        exit 1
    }
    $free = Get-FreePort -Start ($Port + 1)
    if ($free -eq 0) {
        Write-Bad "Could not find a free port near $Port."
        exit 1
    }
    Write-Step "Port $Port is busy, using $free instead."
    $listenPort = $free
}

$url = "http://127.0.0.1:$listenPort/"

# --- 4. Launch -------------------------------------------------------------
if (-not $NoBrowser) {
    Start-Process $url
    Write-Step "Opened $url in your default browser."
}

Write-Host ""
Write-Host "  Serving       $root" -ForegroundColor Green
Write-Host "  URL           $url" -ForegroundColor Green
Write-Host "  Live reload   $(if ($NoReload) { 'OFF' } else { 'ON' })" -ForegroundColor Green
Write-Host "  Auto-stop     $(if ($NoAutoStop) { 'OFF' } else { 'ON (exits when the tab is closed)' })" -ForegroundColor Green
Write-Host "  Stop          Ctrl+C" -ForegroundColor Gray
Write-Host ""

$serverArgs = @('--port', "$listenPort", '--root', $root)
if ($NoReload) { $serverArgs += '--no-reload' }
if ($NoAutoStop) { $serverArgs += '--no-auto-stop' }

$exitCode = 0
try {
    & $py.Source $serverFile @serverArgs
    $exitCode = $LASTEXITCODE
}
catch {
    Write-Bad "Dev server crashed: $($_.Exception.Message)"
    $exitCode = 1
}
finally {
    Write-Host ""
    Write-Host "  Dev server stopped." -ForegroundColor DarkGray
    Write-Host ""
}

exit $exitCode
