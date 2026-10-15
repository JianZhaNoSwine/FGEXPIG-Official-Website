@echo off
setlocal
cd /d "%~dp0.."
call "%~dp0_find-tools.bat"
if not defined FGEXPIG_TOOLS (
  echo.
  pause
  exit /b 1
)
echo.
echo Rebuilding desktop-manifest.json (Rust) ...
echo.
"%FGEXPIG_TOOLS%" manifest --root ..
if errorlevel 1 (
  echo.
  echo [FAILED] desktop-manifest.json was not rebuilt.
  echo.
  pause
  exit /b 1
)
echo.
echo [DONE] desktop-manifest.json has been rebuilt.
echo You can now upload/deploy the updated file.
echo.
pause
