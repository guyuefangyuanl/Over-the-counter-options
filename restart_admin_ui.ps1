# Restart Admin UI with Local Backend
# This script restarts the admin UI to pick up the new environment variable

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Restarting Admin UI (Local Backend Mode)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Navigate to admin-ui directory
$adminUiPath = Join-Path $PSScriptRoot "admin-ui"

if (-not (Test-Path $adminUiPath)) {
    Write-Host "ERROR: admin-ui directory not found!" -ForegroundColor Red
    exit 1
}

Set-Location $adminUiPath

Write-Host "Checking for running Vite process..." -ForegroundColor Yellow

# Kill existing Vite processes
$viteProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowTitle -match "vite" -or $_.CommandLine -match "vite"
}

if ($viteProcesses) {
    Write-Host "Found running Vite process, stopping..." -ForegroundColor Yellow
    $viteProcesses | Stop-Process -Force
    Start-Sleep -Seconds 2
    Write-Host "Stopped existing Vite process" -ForegroundColor Green
} else {
    Write-Host "No running Vite process found" -ForegroundColor Green
}

Write-Host ""
Write-Host "Environment Configuration:" -ForegroundColor Yellow
Write-Host "  VITE_PROXY_MODE = local" -ForegroundColor Green
Write-Host "  Backend Target  = http://127.0.0.1:5002" -ForegroundColor Green
Write-Host ""

Write-Host "Starting Admin UI..." -ForegroundColor Yellow
Write-Host "Admin UI URL: http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

try {
    npm run dev
} catch {
    Write-Host ""
    Write-Host "ERROR: Failed to start Admin UI" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
Write-Host "Admin UI stopped" -ForegroundColor Yellow
