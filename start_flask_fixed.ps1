# Fixed Flask Backend Startup Script
# Addresses Python path issues

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Fixed Flask Backend Service Startup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check port 5002
Write-Host "Checking port 5002..." -ForegroundColor Yellow
$port5002 = netstat -ano | Select-String ":5002"

if ($port5002) {
    Write-Host "WARNING: Port 5002 is in use" -ForegroundColor Yellow
    Write-Host $port5002 -ForegroundColor Gray
    $pid = ($port5002 -split '\s+')[-1]
    if ($pid -match '^\d+$') {
        try {
            Stop-Process -Id $pid -Force -ErrorAction Stop
            Write-Host "Closed process PID: $pid" -ForegroundColor Green
            Start-Sleep -Seconds 2
        } catch {
            Write-Host "Cannot close process automatically" -ForegroundColor Red
        }
    }
} else {
    Write-Host "Port 5002 is available" -ForegroundColor Green
}
Write-Host ""

# Detect Python - Try specific paths first
Write-Host "Detecting Python..." -ForegroundColor Yellow
$pythonCmd = $null

# Known Python installation paths
$possiblePaths = @(
    "C:\Users\Lenovo\Desktop\期末作业\python.exe",  # From your environment
    "python.exe",
    "python",
    "py.exe",
    "py"
)

foreach ($path in $possiblePaths) {
    try {
        Write-Host "Trying: $path" -ForegroundColor Gray
        $result = & $path --version 2>$null
        if ($LASTEXITCODE -eq 0 -or $result -match "Python") {
            Write-Host "✓ Found Python: $result" -ForegroundColor Green
            $pythonCmd = $path
            break
        }
    } catch {
        Write-Host "✗ Not found: $path" -ForegroundColor DarkGray
    }
}

if (-not $pythonCmd) {
    Write-Host ""
    Write-Host "ERROR: Python not found in any of the expected locations" -ForegroundColor Red
    Write-Host "Expected paths checked:" -ForegroundColor Red
    $possiblePaths | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host ""
    Write-Host "Please ensure Python is installed and accessible." -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host ""

# Set environment variables
Write-Host "Setting environment variables..." -ForegroundColor Yellow
$env:FLASK_PORT = "5002"
$env:NODE_ENV = "development"
Write-Host "FLASK_PORT = 5002" -ForegroundColor Green
Write-Host "NODE_ENV = development" -ForegroundColor Green
Write-Host ""

# Test Python with dependencies
Write-Host "Testing Python dependencies..." -ForegroundColor Yellow
try {
    $testResult = & $pythonCmd -c "import flask; import pymongo; import requests; print('Dependencies OK')"
    Write-Host "✓ Dependencies are available" -ForegroundColor Green
} catch {
    Write-Host "⚠ Some dependencies may be missing, attempting to start anyway..." -ForegroundColor Yellow
}

# Start service
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Starting Flask Service..." -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Service URL: http://localhost:5002" -ForegroundColor Cyan
Write-Host "Health Check: http://localhost:5002/api/v1/health" -ForegroundColor Cyan
Write-Host "Python used: $pythonCmd" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

try {
    & $pythonCmd app.py
} catch {
    Write-Host ""
    Write-Host "ERROR: Service failed to start" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
}

Write-Host ""
Write-Host "Service stopped" -ForegroundColor Yellow
Read-Host "Press Enter to exit"
