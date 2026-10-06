@echo off
cd /d "%~dp0"
echo Building language packs from i18n/ui-strings.csv + i18n/shop-strings.csv + i18n/resources-strings.csv + i18n/hotspot-strings.csv + i18n/title-strings.csv ...
node "%~dp0build-i18n-pack.js"
if errorlevel 1 (
  echo.
  echo FAILED: Node.js is required. Install it, then run this file again.
) else (
  echo.
  echo Done. Reload the page to apply (i18n/index.js + i18n/lang/*.js updated).
)
pause
