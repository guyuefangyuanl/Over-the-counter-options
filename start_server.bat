@echo off
echo Starting Flask Server...
set FLASK_APP=app.py
set FLASK_ENV=development
python app.py
pause