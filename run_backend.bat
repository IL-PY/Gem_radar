@echo off
title GemRadar Backend Engine
cd /d "%~dp0backend"

echo ========================================================
echo          GEMRADAR - BACKEND ENGINE (FASTAPI)
echo ========================================================

rem Terminate any stale process holding port 8000 before binding
for /f "tokens=4,5" %%a in ('netstat -ano ^| findstr :8000') do (
    if "%%a"=="LISTENING" (
        echo [GemRadar] Clearing port 8000, killing PID %%b
        taskkill /F /T /PID %%b >nul 2>&1
    )
)

if not exist "venv\Scripts\python.exe" (
    echo [ERROR] Python virtual environment not found in backend\venv!
    echo Creating virtual environment and installing dependencies...
    python -m venv venv
    venv\Scripts\pip install fastapi uvicorn[standard] telethon pydantic pydantic-settings python-dotenv websockets geopy shapely
)

echo Starting FastAPI server on http://127.0.0.1:8000...
venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

echo.
echo [Backend stopped]
pause
