@echo off
rem Thin cmd entry for the PowerShell installer. All arguments are forwarded.
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1" %*
set "CODE=%ERRORLEVEL%"
if "%~1"=="" (
  echo.
  pause
)
endlocal & exit /b %CODE%
