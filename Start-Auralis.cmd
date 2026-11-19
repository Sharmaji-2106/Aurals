@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-Auralis.ps1" %*
if errorlevel 1 (
  echo.
  echo Auralis could not be started. See the error above.
  pause
)
