@echo off
chcp 65001 >nul
title FREE Dubber Pro - Desktop App
color 0b

echo ===================================================
echo     🎙️  FREE DUBBER PRO - DESKTOP APPLICATION
echo ===================================================
echo.
echo [*] Launching FREE Dubber Pro Desktop Window...
cd /d "%~dp0"

call npm run app
