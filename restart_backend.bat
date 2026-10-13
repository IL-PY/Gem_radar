@echo off
title GemRadar Backend Restart
echo ========================================================
echo   GEMRADAR - KILL STALE BACKENDS + FRESH START (port 8000)
echo ========================================================
echo.

echo [1/2] Terminating whatever holds :8000 (old backends, zombies)...
for /f "tokens=4,5" %%a in ('netstat -ano ^| findstr :8000') do (
    if "%%a"=="LISTENING" (
        echo   -^> Killing process tree PID %%b
        taskkill /F /T /PID %%b >nul 2>&1
    )
)

ping -n 3 127.0.0.1 >nul

echo.
echo [2/2] Verifying port 8000 is free...
netstat -ano | findstr :8000 | findstr LISTENING >nul 2>&1
if %errorlevel%==0 (
    echo [WARN] Something still holds :8000. Force killing any remaining process...
    for /f "tokens=4,5" %%a in ('netstat -ano ^| findstr :8000') do (
        if "%%a"=="LISTENING" taskkill /F /T /PID %%b >nul 2>&1
    )
    ping -n 2 127.0.0.1 >nul
)

echo Port 8000 is free. Starting fresh backend (new window)...
start "GemRadar Backend Engine" cmd /k "%~dp0run_backend.bat"

echo.
echo ========================================================
echo Done. In the Backend window wait for:
echo   1. Uvicorn running on http://127.0.0.1:8000
echo   2. Telegram CONNECTED (if session configured)
echo Then refresh the map (F5) - live tracks will appear.
echo ========================================================
pause
