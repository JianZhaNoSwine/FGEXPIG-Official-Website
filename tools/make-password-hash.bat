@echo off
cd /d "%~dp0"
set /p PW=Enter new admin password: 
if "%PW%"=="" (
  echo No password entered.
  pause
  exit /b 1
)
node "%~dp0make-password-hash.js" "%PW%"
pause
