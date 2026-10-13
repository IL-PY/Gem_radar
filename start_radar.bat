@echo off
title GemRadar Tactical Launcher
echo ========================================================
echo        GEMRADAR - TACTICAL AIR SITUATION RADAR
echo ========================================================
echo.

echo [1/3] Terminating stale processes and clearing ports...

rem Kill any process listening on port 8000 (Backend)
for /f "tokens=4,5" %%a in ('netstat -ano ^| findstr :8000') do (
    if "%%a"=="LISTENING" (
        echo   -^> Killing stale backend PID %%b
        taskkill /F /T /PID %%b >nul 2>&1
    )
)

rem Kill any process listening on port 5173 (Frontend)
for /f "tokens=4,5" %%a in ('netstat -ano ^| findstr :5173') do (
    if "%%a"=="LISTENING" (
        echo   -^> Killing stale frontend PID %%b
        taskkill /F /T /PID %%b >nul 2>&1
    )
)

ping -n 3 127.0.0.1 >nul

echo [2/3] Launching fresh Backend Engine...
start "GemRadar Backend Engine" cmd /k "%~dp0run_backend.bat"

ping -n 3 127.0.0.1 >nul

echo [3/3] Launching fresh Frontend Interface...
start "GemRadar Frontend UI" cmd /k "%~dp0run_frontend.bat"

echo.
echo Waiting for services to initialize...
ping -n 4 127.0.0.1 >nul

echo Opening GemRadar in your browser...
start http://localhost:5173

echo.
echo ========================================================
echo GemRadar is now running!
echo Keep the Backend and Frontend command windows open.
echo ========================================================
