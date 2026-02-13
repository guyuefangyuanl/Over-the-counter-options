Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Starting Flask Backend Service" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Set environment variables
$env:FLASK_PORT = "5002"
$env:NODE_ENV = "development"

# Detect Python
Write-Host "Detecting Python environment..." -ForegroundColor Yellow

$pythonCmd = $null

# Try python command
try {
    $version = python --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Found Python: $version" -ForegroundColor Green
        $pythonCmd = "python"
    }
} catch {
    Write-Host "python command not available" -ForegroundColor Yellow
}

# If python not available, try py command
if (-not $pythonCmd) {
    try {
        $version = py --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Found Python: $version" -ForegroundColor Green
            $pythonCmd = "py"
        }
    } catch {
        Write-Host "py command not available" -ForegroundColor Yellow
    }
}

# If neither found
if (-not $pythonCmd) {
    Write-Host ""
    Write-Host "ERROR: Cannot find Python interpreter" -ForegroundColor Red
    Write-Host "Please ensure Python is properly installed and added to PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host ""
Write-Host "Starting Flask backend service (Port 5002)..." -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Start service
& $pythonCmd app.py

Write-Host ""
Write-Host "Service stopped" -ForegroundColor Yellow
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
