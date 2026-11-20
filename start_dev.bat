@echo off
chcp 65001 >nul
title FREE Dubber Pro - Developer Mode
color 0b

echo ===================================================
echo     🎙️  FREE DUBBER PRO - DEVELOPER MODE
echo ===================================================
echo.
echo [*] Navigating to project directory...
cd /d "%~dp0"
if exist "%LOCALAPPDATA%\Programs\nodejs" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"

:: Auto-clear port 28989 if occupied by previous session
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":28989" ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1

:: Check if node_modules exists
if not exist "node_modules\" (
    echo [!] node_modules not found. Installing packages...
    call npm install
)

echo [*] Starting server with Nodemon on http://localhost:28989...
echo [*] Browser will open automatically once server is ready...
echo.

:: Automatically launch the default browser as soon as server responds
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command "$maxRetries=60; $attempt=0; while ($attempt -lt $maxRetries) { Start-Sleep -Milliseconds 500; $attempt++; try { $res = Invoke-WebRequest -Uri 'http://localhost:28989/api/health' -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop; if ($res.StatusCode -eq 200) { Start-Process 'http://localhost:28989'; exit 0 } } catch {} }; Start-Process 'http://localhost:28989'"

:: Run developer mode
call npm run dev

pause
