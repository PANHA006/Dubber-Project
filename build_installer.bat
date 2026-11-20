@echo off
chcp 65001 >nul
title Build FREE Dubber Pro Installer (.exe)
color 0a

echo ===================================================
echo     📦  BUILDING FREE DUBBER PRO INSTALLER (.EXE)
echo ===================================================
echo.
echo [*] Project Directory: %~dp0
cd /d "%~dp0"

echo [*] Step 1: Building CSS bundle...
call npm run build:css

echo [*] Step 2: Packaging Desktop App & NSIS Setup Wizard...
call npm run dist

echo.
echo ===================================================
echo     🎉 BUILD COMPLETE! Check the "dist" folder.
echo ===================================================
pause
