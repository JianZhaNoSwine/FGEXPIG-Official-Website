@echo off
rem 定位 fgexpig-tools.exe：优先 tools\bin，其次 rust 构建目录
rem 结果写入 FGEXPIG_TOOLS
set "FGEXPIG_TOOLS="
if exist "%~dp0bin\fgexpig-tools.exe" set "FGEXPIG_TOOLS=%~dp0bin\fgexpig-tools.exe"
if not defined FGEXPIG_TOOLS if exist "%~dp0..\rust\target\release\fgexpig-tools.exe" set "FGEXPIG_TOOLS=%~dp0..\rust\target\release\fgexpig-tools.exe"
if not defined FGEXPIG_TOOLS echo [ERROR] fgexpig-tools.exe not found. Run build\tools\build-rust-tools.bat first.
exit /b 0
