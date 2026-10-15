@echo off
setlocal
cd /d "%~dp0.."
call "%~dp0_find-tools.bat"
if not defined FGEXPIG_TOOLS (
  echo.
  pause
  exit /b 1
)
echo Building language packs (Rust) ...
echo.
"%FGEXPIG_TOOLS%" i18n-pack --root ..
if errorlevel 1 (
  echo.
  echo [FAILED] i18n-pack failed.
  pause
  exit /b 1
)
echo.
echo Done. Reload the page to apply (i18n/index.js + i18n/lang/*.js updated).
echo.
pause
