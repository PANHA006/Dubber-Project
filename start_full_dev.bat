@echo off
title DAI Dubber Pro - Full Dev Mode (Server + Tailwind)
color 0a

echo ===================================================
echo     🎙️  DAI DUBBER PRO - FULL DEVELOPER MODE
echo        (Nodemon Server + Tailwind CSS Watcher)
echo ===================================================
echo.
cd /d "%~dp0"
if exist "%LOCALAPPDATA%\Programs\nodejs" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"

:: Auto-clear port 5000 if occupied by previous session
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000" ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1

:: Check if node_modules exists
if not exist "node_modules\" (
    echo [!] Installing packages...
    call npm install
)

echo [*] Launching Browser at http://localhost:5000...
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:5000"

echo [*] Starting Server and CSS Watcher...
call npm run dev:all

pause
