@echo off
setlocal
cd /d "%~dp0.."
call "%~dp0_find-tools.bat"
if not defined FGEXPIG_TOOLS (
  echo.
  pause
  exit /b 1
)
"%FGEXPIG_TOOLS%" check-i18n --root ..
echo.
pause
