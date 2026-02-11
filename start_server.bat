@echo off
echo Starting Flask API Server...
set FLASK_APP=app.py
set FLASK_ENV=development
set PORT=5002

:: Check if python is available
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo Python not found! Please install Python 3.8+ and add it to your PATH.
    pause
    exit /b
)

:: Install dependencies if needed (optional, can be commented out)
:: pip install -r requirements.txt

:: Run the server
python app.py
pause
