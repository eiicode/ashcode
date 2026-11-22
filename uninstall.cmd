@echo off
rem Thin cmd entry for the PowerShell uninstaller. All arguments are forwarded.
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\uninstall.ps1" %*
set "CODE=%ERRORLEVEL%"
if "%~1"=="" (
  echo.
  pause
)
endlocal & exit /b %CODE%
