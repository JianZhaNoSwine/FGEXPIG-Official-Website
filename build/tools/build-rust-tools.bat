@echo off
setlocal
cd /d "%~dp0.."
echo Building FGEXPIG website tools (release) ...

set "CARGO="
if exist "%USERPROFILE%\.cargo\bin\cargo.exe" set "CARGO=%USERPROFILE%\.cargo\bin\cargo.exe"
if not defined CARGO for /f "delims=" %%i in ('where cargo 2^>nul') do if not defined CARGO set "CARGO=%%i"
if not defined CARGO (
  echo [ERROR] cargo not found. Install Rust: https://rustup.rs
  pause
  exit /b 1
)

pushd rust
"%CARGO%" build --release -p fgexpig-tools
if errorlevel 1 (
  popd
  echo.
  echo [FAILED] fgexpig-tools build failed.
  pause
  exit /b 1
)
echo Building wasm (map score) ...
"%CARGO%" build --release --target wasm32-unknown-unknown -p fgexpig-wasm
if errorlevel 1 (
  echo [WARN] wasm build failed - JS fallback stays in use
) else (
  copy /y "target\wasm32-unknown-unknown\release\fgexpig_wasm.wasm" "..\..\js\map-score.wasm" >/dev/null
)
popd

if not exist "tools\bin" mkdir "tools\bin"
copy /y "rust\target\release\fgexpig-tools.exe" "tools\bin\fgexpig-tools.exe" >/dev/null
echo.
echo [DONE] build\tools\bin\fgexpig-tools.exe
echo Tools: manifest / i18n-pack / check-i18n / password-hash / csv / datafile
echo.
pause
