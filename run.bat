@echo off
title MarbsLF - Koronadal Lost and Found Platform
echo ===================================================
echo   Starting MarbsLF Website on http://localhost:8080
echo ===================================================
echo.
start http://localhost:8080
python -m http.server 8080
pause
