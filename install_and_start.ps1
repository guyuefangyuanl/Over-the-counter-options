# Install Dependencies and Start Flask Service
# Uses the correct Python path to ensure everything works

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Install Dependencies & Start Flask Service" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Find the correct Python executable
Write-Host "Finding Python executable..." -ForegroundColor Yellow

$pythonPaths = @(
    "C:\Users\Lenovo\Desktop\期末作业\python.exe",
    "python.exe",
    "python",
    "py.exe",
    "py"
)

$pythonCmd = $null
foreach ($path in $pythonPaths) {
    try {
        $result = & $path --version 2>$null
        if ($LASTEXITCODE -eq 0 -or $result -match "Python") {
            Write-Host "✓ Found Python: $result at $path" -ForegroundColor Green
            $pythonCmd = $path
            break
        }
    } catch {
        Write-Host "✗ Not found: $path" -ForegroundColor DarkGray
    }
}

if (-not $pythonCmd) {
    Write-Host ""
    Write-Host "❌ ERROR: Python not found!" -ForegroundColor Red
    Write-Host "Please ensure Python is installed." -ForegroundColor Red
    exit 1
}
Write-Host ""

# Install missing dependencies using the correct Python
Write-Host "Installing/Updating Python dependencies..." -ForegroundColor Yellow
Write-Host "Using Python: $pythonCmd" -ForegroundColor Cyan
Write-Host ""

try {
    # First, upgrade pip
    Write-Host "Upgrading pip..." -ForegroundColor Gray
    & $pythonCmd -m pip install --upgrade pip
    
    # Install requirements from the project file
    Write-Host "Installing project requirements..." -ForegroundColor Gray
    & $pythonCmd -m pip install -r requirements.txt
    
    Write-Host "✓ Dependencies installation completed!" -ForegroundColor Green
} catch {
    Write-Host "⚠ Some packages may have failed to install, continuing anyway..." -ForegroundColor Yellow
}

Write-Host ""

# Verify critical dependencies
Write-Host "Verifying critical dependencies..." -ForegroundColor Yellow

$depsToCheck = @("flask", "pymongo", "requests", "openpyxl", "akshare", "flask_cors", "dotenv")
$missingDeps = @()

foreach ($dep in $depsToCheck) {
    try {
        $result = & $pythonCmd -c "import $dep" 2>$null
        Write-Host "✓ $dep" -ForegroundColor Green
    } catch {
        Write-Host "❌ $dep" -ForegroundColor Red
        $missingDeps += $dep
    }
}

if ($missingDeps.Count -gt 0) {
    Write-Host ""
    Write-Host "Installing missing dependencies: $($missingDeps -join ', ')" -ForegroundColor Yellow
    foreach ($dep in $missingDeps) {
        & $pythonCmd -m pip install $dep
    }
}

Write-Host ""

# Set environment variables
Write-Host "Setting environment variables..." -ForegroundColor Yellow
$env:FLASK_PORT = "5002"
$env:NODE_ENV = "development"
Write-Host "FLASK_PORT = 5002" -ForegroundColor Green
Write-Host "NODE_ENV = development" -ForegroundColor Green
Write-Host ""

# Check and clear port 5002
Write-Host "Checking port 5002..." -ForegroundColor Yellow
$port5002 = netstat -ano | Select-String ":5002"

if ($port5002) {
    Write-Host "Port 5002 is in use, attempting to close..." -ForegroundColor Yellow
    $pid = ($port5002 -split '\s+')[-1]
    if ($pid -match '^\d+$') {
        try {
            Stop-Process -Id $pid -Force -ErrorAction Stop
            Write-Host "Closed process PID: $pid" -ForegroundColor Green
            Start-Sleep -Seconds 2
        } catch {
            Write-Host "Could not close process automatically" -ForegroundColor Red
        }
    }
} else {
    Write-Host "Port 5002 is available" -ForegroundColor Green
}
Write-Host ""

# Test if app can import without errors
Write-Host "Testing app import..." -ForegroundColor Yellow
try {
    $testResult = & $pythonCmd -c "import app; print('Import successful')" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ App imports successfully" -ForegroundColor Green
    } else {
        Write-Host "⚠ Import test had issues, but continuing..." -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠ Import test failed, but continuing..." -ForegroundColor Yellow
}

Write-Host ""
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

# Start the Flask app
try {
    & $pythonCmd app.py
} catch {
    Write-Host ""
    Write-Host "❌ ERROR: Service failed to start" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
}

Write-Host ""
Write-Host "Service stopped" -ForegroundColor Yellow
Read-Host "Press Enter to exit"
