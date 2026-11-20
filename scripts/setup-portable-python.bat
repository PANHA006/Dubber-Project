@echo off
chcp 65001 >nul
title Setup Portable Python Runtime - FREE Dubber Pro
echo ========================================================
echo   Setting up 100%% Portable Python Runtime for Standalone
echo ========================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-portable-python.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Failed to setup portable python runtime.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [DONE] Portable python runtime is ready for standalone packaging!
pause
