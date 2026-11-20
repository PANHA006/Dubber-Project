@echo off
chcp 65001 >nul
title FREE Dubber Pro - Full Dev Mode (Server + Tailwind)
color 0a

echo ===================================================
echo     🎙️  FREE DUBBER PRO - FULL DEVELOPER MODE
echo        (Nodemon Server + Tailwind CSS Watcher)
echo ===================================================
echo.
cd /d "%~dp0"
if exist "%LOCALAPPDATA%\Programs\nodejs" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"

:: Auto-clear port 28989 if occupied by previous session
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":28989" ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1

:: Check if node_modules exists
if not exist "node_modules\" (
    echo [!] Installing packages...
    call npm install
)

echo [*] Browser will open automatically once server is ready at http://localhost:28989...
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command "$maxRetries=60; $attempt=0; while ($attempt -lt $maxRetries) { Start-Sleep -Milliseconds 500; $attempt++; try { $res = Invoke-WebRequest -Uri 'http://localhost:28989/api/health' -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop; if ($res.StatusCode -eq 200) { Start-Process 'http://localhost:28989'; exit 0 } } catch {} }; Start-Process 'http://localhost:28989'"

echo [*] Starting Server and CSS Watcher...
call npm run dev:all

pause
