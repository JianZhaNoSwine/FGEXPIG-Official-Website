@echo off
setlocal
cd /d "%~dp0.."
set "MAKENSIS=%LOCALAPPDATA%\electron-builder\Cache\nsis-3.0.4.1\nsis-3.0.4.1-1mx3n\Bin\makensis.exe"
if not exist "%MAKENSIS%" for /f "delims=" %%i in ('dir /b /s "%LOCALAPPDATA%\electron-builder\Cache\nsis*\makensis.exe" 2^>nul') do if not defined MAKENSIS set "MAKENSIS=%%i"
if not exist "%MAKENSIS%" (
  echo [ERROR] makensis.exe not found. Set MAKENSIS at the top of this file.
  pause
  exit /b 1
)
if not exist "rust\target\release\fgexpig-shell.exe" (
  echo [ERROR] rust\target\release\fgexpig-shell.exe missing.
  echo         Run build\tools\build-rust-tools.bat first.
  pause
  exit /b 1
)
echo [1/2] generating installer UI assets...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0make-installer-ui.ps1"
if errorlevel 1 (
  echo [FAILED] UI asset generation failed.
  pause
  exit /b 1
)
if not exist "desktop-dist" mkdir "desktop-dist"
"%MAKENSIS%" /V2 "tools\installer\fgexpig-classic.nsi"
if errorlevel 1 (
  echo [FAILED] classic installer build failed.
  pause
  exit /b 1
)
"%MAKENSIS%" /V2 "tools\installer\fgexpig.nsi"
if errorlevel 1 (
  echo [FAILED] installer build failed.
  pause
  exit /b 1
)
echo.
echo [DONE] build\desktop-dist\
echo        FGEXPIG Setup 1.0.7-r.exe          (原版界面)
echo        FGEXPIG Setup 1.0.7-r Custom.exe   (自绘黑色极简界面)
echo.
pause