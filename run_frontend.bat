@echo off
title GemRadar Frontend UI
cd /d "%~dp0frontend"

echo ========================================================
echo          GEMRADAR - FRONTEND UI (VITE REACT)
echo ========================================================

rem Terminate any stale process holding port 5173 before binding
for /f "tokens=4,5" %%a in ('netstat -ano ^| findstr :5173') do (
    if "%%a"=="LISTENING" (
        echo [GemRadar] Clearing port 5173, killing PID %%b
        taskkill /F /T /PID %%b >nul 2>&1
    )
)

if not exist "node_modules" (
    echo [GemRadar] Installing frontend packages...
    npm install
)

echo Starting Vite Dev Server on http://localhost:5173...
npm run dev -- --host

echo.
echo [Frontend stopped]
pause
