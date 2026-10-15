@echo off
setlocal
cd /d "%~dp0.."
echo Building FGEXPIG Rust binaries (release) ...

rem 编译需要 Rust(GNU) + MSYS2 mingw64（as/ar/windres/gcc 供 cc-rs 与 tauri-winres 使用）
set "MINGW=%USERPROFILE%\.fgexpig-toolchain\msys64\msys64\mingw64\bin"
if exist "%MINGW%\gcc.exe" set "PATH=%MINGW%;%PATH%"

set "CARGO="
if exist "%USERPROFILE%\.cargo\bin\cargo.exe" set "CARGO=%USERPROFILE%\.cargo\bin\cargo.exe"
if not defined CARGO for /f "delims=" %%i in ('where cargo 2^>nul') do if not defined CARGO set "CARGO=%%i"
if not defined CARGO (
  echo [ERROR] cargo not found. Install Rust: https://rustup.rs
  pause
  exit /b 1
)

pushd rust
"%CARGO%" build --release
if errorlevel 1 (
  popd
  echo.
  echo [FAILED] cargo build failed.
  echo   case 1: "failed to remove ..." / permission error while writing fgexpig-shell.exe / fgexpig-desktop.exe
  echo   case 2: windres/gcc error - check MSYS2 mingw-w64 toolchain at %MINGW%
  pause
  exit /b 1
)
echo Building wasm (map score) ...
"%CARGO%" build --release --target wasm32-unknown-unknown -p fgexpig-wasm
if errorlevel 1 (
  echo [WARN] wasm build failed - exe unaffected, JS fallback stays in use
) else (
  copy /y "target\wasm32-unknown-unknown\release\fgexpig_wasm.wasm" "..\..\js\map-score.wasm" >nul
)
popd

if not exist "tools\bin" mkdir "tools\bin"
copy /y "rust\target\release\fgexpig-tools.exe" "tools\bin\fgexpig-tools.exe" >nul
copy /y "rust\target\release\fgexpig-desktop.exe" "tools\bin\fgexpig-desktop.exe" >nul
copy /y "rust\target\release\fgexpig-shell.exe" "tools\bin\fgexpig-shell.exe" >nul
copy /y "rust\target\release\WebView2Loader.dll" "tools\bin\WebView2Loader.dll" >nul
echo.
echo [DONE] build\tools\bin\ : fgexpig-tools / fgexpig-desktop / fgexpig-shell / WebView2Loader.dll
echo Next: build\tools\build-installer.bat
echo.
pause
