Unicode true
; FGEXPIG installer (NSIS): Tauri shell + sidecar + bundled fonts

; 中文字符串统一用 UTF-8（配合首行 Unicode true）
!define APP_NAME "FGEXPIG"
!define APP_VERSION "1.0.7-r"
!define APP_PUBLISHER "JianZha"

Name "${APP_NAME}"
OutFile "..\..\desktop-dist\FGEXPIG Setup ${APP_VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\FGEXPIG"
InstallDirRegKey HKCU "Software\${APP_NAME}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
ShowInstDetails nevershow
ShowUninstDetails nevershow
BrandingText " "

VIProductVersion "1.0.7.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "FileVersion" "${APP_VERSION}"
VIAddVersionKey "CompanyName" "${APP_PUBLISHER}"
VIAddVersionKey "FileDescription" "FGEXPIG Desktop"
VIAddVersionKey "LegalCopyright" "FGEXPIG"

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

!define MUI_ICON "..\..\rust\src-tauri\icons\icon.ico"
!define MUI_UNICON "..\..\rust\src-tauri\icons\icon.ico"
!insertmacro MUI_PAGE_DIRECTORY
!define MUI_PAGE_CUSTOMFUNCTION_SHOW ClassicInstShow
!define MUI_INSTFILESPAGE_FINISHHEADER_TEXT "安装中..."
!define MUI_INSTFILESPAGE_FINISHHEADER_SUBTEXT " "
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

; ---- 进度页：只保留“安装中...”文字，不显示其它任何文字 ----
Function ClassicInstShow
  FindWindow $R1 "#32770" "" $HWNDPARENT
  ${If} $R1 != 0
    GetDlgItem $R2 $R1 1006            ; 状态文字（抽取: xxx）
    ShowWindow $R2 0
    GetDlgItem $R2 $R1 1027            ; 显示详细信息按钮
    ShowWindow $R2 0
  ${EndIf}
  GetDlgItem $R2 $HWNDPARENT 1038      ; 副标题
  ShowWindow $R2 0
  GetDlgItem $R2 $HWNDPARENT 1037      ; 标题 -> 安装中...
  SendMessage $R2 ${WM_SETTEXT} 0 "STR:安装中..."
FunctionEnd

Section "Install"
  SetOutPath "$INSTDIR"
  File "..\..\rust\target\release\fgexpig-shell.exe"
  File "..\..\rust\target\release\fgexpig-desktop.exe"
  File "..\..\rust\target\release\WebView2Loader.dll"
  File "..\..\rust\src-tauri\icons\icon.ico"
  SetOutPath "$INSTDIR\assets\fonts"
  File "..\..\rust\src-tauri\dist\assets\fonts\default.woff"
  File "..\..\rust\src-tauri\dist\assets\fonts\kaiti.woff"
  File "..\..\rust\src-tauri\dist\assets\fonts\mengya.woff"
  File "..\..\rust\src-tauri\dist\assets\fonts\shanhai.woff"
  SetOutPath "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\fgexpig-shell.exe" "" "$INSTDIR\icon.ico"
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\fgexpig-shell.exe" "" "$INSTDIR\icon.ico"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Uninstall ${APP_NAME}.lnk" "$INSTDIR\Uninstall.exe"

  WriteRegStr HKCU "Software\${APP_NAME}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Uninstall ${APP_NAME}.lnk"
  RMDir "$SMPROGRAMS\${APP_NAME}"
  Delete "$INSTDIR\fgexpig-shell.exe"
  Delete "$INSTDIR\fgexpig-desktop.exe"
  Delete "$INSTDIR\WebView2Loader.dll"
  Delete "$INSTDIR\icon.ico"
  Delete "$INSTDIR\Uninstall.exe"
  Delete "$INSTDIR\assets\fonts\default.woff"
  Delete "$INSTDIR\assets\fonts\kaiti.woff"
  Delete "$INSTDIR\assets\fonts\mengya.woff"
  Delete "$INSTDIR\assets\fonts\shanhai.woff"
  RMDir "$INSTDIR\assets\fonts"
  RMDir "$INSTDIR\assets"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
  DeleteRegKey HKCU "Software\${APP_NAME}"
  ; 站点缓存与状态文件保留（%APPDATA%\fgexpig-desktop），需要时手动删除
SectionEnd