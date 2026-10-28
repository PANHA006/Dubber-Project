@echo off
title DAI Dubber Pro - Developer Mode
color 0b

echo ===================================================
echo     🎙️  DAI DUBBER PRO - DEVELOPER MODE
echo ===================================================
echo.
echo [*] Navigating to project directory...
cd /d "%~dp0"
if exist "%LOCALAPPDATA%\Programs\nodejs" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"

:: Auto-clear port 5000 if occupied by previous session
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000" ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1

:: Check if node_modules exists
if not exist "node_modules\" (
    echo [!] node_modules not found. Installing packages...
    call npm install
)

echo [*] Starting server with Nodemon on http://localhost:5000...
echo [*] Opening browser at http://localhost:5000 in 2 seconds...
echo.

:: Automatically launch the default browser
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:5000"

:: Run developer mode
call npm run dev

pause
