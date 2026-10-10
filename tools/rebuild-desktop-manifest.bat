@echo off
setlocal
cd /d "%~dp0.."

set "NODE_EXE="
for %%I in (node.exe) do if not defined NODE_EXE if exist "%%~$PATH:I" set "NODE_EXE=%%~$PATH:I"

if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not defined NODE_EXE (
  echo.
  echo [ERROR] Node.js not found.
  echo Install Node.js, or place node.exe in PATH and run this file again.
  echo.
  pause
  exit /b 1
)

echo.
echo Rebuilding desktop-manifest.json...
echo Node: "%NODE_EXE%"
echo.

"%NODE_EXE%" "%~dp0build-desktop-manifest.js"
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
