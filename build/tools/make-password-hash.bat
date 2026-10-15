@echo off
setlocal
cd /d "%~dp0.."
call "%~dp0_find-tools.bat"
if not defined FGEXPIG_TOOLS (
  echo.
  pause
  exit /b 1
)
set /p PW=Enter new admin password: 
if "%PW%"=="" (
  echo No password entered.
  pause
  exit /b 1
)
"%FGEXPIG_TOOLS%" password-hash "%PW%"
pause
