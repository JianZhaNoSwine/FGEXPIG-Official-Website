; FGEXPIG installer (NSIS) - 纯黑矩形 + 自绘极简现代界面
Unicode true
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"
LoadLanguageFile "${NSISDIR}\Contrib\Language files\SimpChinese.nlf"

!define APP_NAME "FGEXPIG"
!define APP_VERSION "1.0.8-r"
!define APP_PUBLISHER "JianZha"

; ---------- 配色（SetCtlColors 为 0xBBGGRR）----------
!define CLR_BG    0x000000
!define CLR_TEXT  0xFFFFFF
!define CLR_SUB   0x8C8C8C
!define CLR_DIM   0x5A5A5A
!define CLR_PATH  0xE6E6E6

; ---------- 覆盖整窗的页面尺寸 ----------
!define OVX -4
!define OVY -4
!define OVW 1400
!define OVH 1000
!define BTN_Y 196

Name "${APP_NAME}"
OutFile "..\..\desktop-dist\FGEXPIG Setup ${APP_VERSION} Custom.exe"
InstallDir "$LOCALAPPDATA\Programs\FGEXPIG"
InstallDirRegKey HKCU "Software\${APP_NAME}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
ShowInstDetails hide
ShowUninstDetails hide
BrandingText " "
VIProductVersion "1.0.8.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "FileVersion" "${APP_VERSION}"
VIAddVersionKey "CompanyName" "${APP_PUBLISHER}"
VIAddVersionKey "FileDescription" "FGEXPIG Desktop"
VIAddVersionKey "LegalCopyright" "FGEXPIG"

Var hPage
Var hFontTitle
Var hFontBody
Var hPathLbl
Var hPb
Var progTick
Var img1
Var img2
Var img3

; ================= 通用 =================
Function MakeFrameless
  System::Call 'user32::GetWindowLongW(p$HWNDPARENT,i-16)i.s'
  Pop $0
  IntOp $0 $0 & 0xFF38FFFF
  System::Call 'user32::SetWindowLongW(p$HWNDPARENT,i-16,ir0)i'
  System::Call 'user32::SetWindowPos(p$HWNDPARENT,p0,i0,i0,i0,i0,i0x27)i'
FunctionEnd

Function HideStdButtons
  GetDlgItem $0 $HWNDPARENT 1
  ShowWindow $0 0
  GetDlgItem $0 $HWNDPARENT 2
  ShowWindow $0 0
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 0
FunctionEnd

; 去掉 WS_EX_TRANSPARENT：自绘静态控件必须自己画背景，否则重绘后会丢失
!macro MKOPAQUE ctl
  System::Call 'user32::GetWindowLongW(p${ctl},i-20)i.s'
  Pop $0
  IntOp $0 $0 & 0xFFFFFFDF
  System::Call 'user32::SetWindowLongW(p${ctl},i-20,ir0)i'
!macroend

; 铺满整窗的黑色自绘页（含黑色底板）
!macro OPEN_BLACK_PAGE
  nsDialogs::Create 1018
  Pop $hPage
  ${If} $hPage == error
    Quit
  ${EndIf}
  System::Call 'user32::MoveWindow(p$hPage,i${OVX},i${OVY},i${OVW},i${OVH},i1)i'
  SetCtlColors $hPage ${CLR_TEXT} ${CLR_BG}
  ${NSD_CreateLabel} 0 0 100% 100% ""
  Pop $1
  !insertmacro MKOPAQUE $1
  SetCtlColors $1 ${CLR_TEXT} ${CLR_BG}
!macroend

!macro MKFONTS
  CreateFont $hFontTitle "Microsoft YaHei UI" 16 700
  CreateFont $hFontBody "Microsoft YaHei UI" 11 400
!macroend

!macro LBL font x y w h text color
  ${NSD_CreateLabel} ${x} ${y} ${w} ${h} "${text}"
  Pop $1
  !insertmacro MKOPAQUE $1
  SendMessage $1 ${WM_SETFONT} ${font} 1
  SetCtlColors $1 ${color} ${CLR_BG}
!macroend

Function .onGUIInit
  Call MakeFrameless
FunctionEnd

; ================= 第 1 页：安装选项 =================
Function PageMain
  Call HideStdButtons
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /oname=ui_install.bmp "ui\btn-install.bmp"
  File /oname=ui_browse.bmp "ui\btn-browse.bmp"
  File /oname=ui_accent.bmp "ui\accent.bmp"
  File /oname=ui_finish.bmp "ui\btn-finish.bmp"

  !insertmacro OPEN_BLACK_PAGE
  !insertmacro MKFONTS

  !insertmacro LBL $hFontTitle 28 26 300 26u "${APP_NAME}" ${CLR_TEXT}
  ${NSD_CreateBitmap} 28 56 36 4 ""
  Pop $1
  ${NSD_SetImage} $1 "$PLUGINSDIR\ui_accent.bmp" $img3
  !insertmacro LBL $hFontBody 28 68 300 14u "桌面版安装程序" ${CLR_SUB}
  !insertmacro LBL $hFontBody 28 118 300 14u "安装位置" ${CLR_SUB}

  ${NSD_CreateLabel} 28 138 372 16u "$INSTDIR"
  Pop $hPathLbl
  !insertmacro MKOPAQUE $hPathLbl
  ${NSD_AddStyle} $hPathLbl ${SS_ENDELLIPSIS}
  SendMessage $hPathLbl ${WM_SETFONT} $hFontBody 1
  SetCtlColors $hPathLbl ${CLR_PATH} ${CLR_BG}

  ${NSD_CreateBitmap} 28 ${BTN_Y} 126 36 ""
  Pop $1
  ${NSD_SetImage} $1 "$PLUGINSDIR\ui_install.bmp" $img1
  ${NSD_OnClick} $1 OnInstallNow

  ${NSD_CreateBitmap} 166 ${BTN_Y} 158 36 ""
  Pop $1
  ${NSD_SetImage} $1 "$PLUGINSDIR\ui_browse.bmp" $img2
  ${NSD_OnClick} $1 OnBrowseDir

  !insertmacro LBL $hFontBody 392 26 18 14u "✕" ${CLR_DIM}
  ${NSD_OnClick} $1 OnQuitInstall

  nsDialogs::Show
FunctionEnd

Function OnInstallNow
  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${BM_CLICK} 0 0
FunctionEnd

Function OnBrowseDir
  nsDialogs::SelectFolderDialog "选择安装位置" "$INSTDIR"
  Pop $0
  StrCmp $0 "error" done
  StrCpy $INSTDIR $0
  ${NSD_SetText} $hPathLbl "$INSTDIR"
done:
FunctionEnd

Function OnQuitInstall
  Quit
FunctionEnd

; ================= 第 2 页：安装进度 =================
Function instPre
FunctionEnd

Function instShow
  Call HideStdButtons
  StrCpy $progTick 0
  FindWindow $R1 "#32770" "" $HWNDPARENT
  ${If} $R1 != 0
    ; 只保留进度条：隐藏状态文字 / 详细信息按钮
    GetDlgItem $2 $R1 1006
    ShowWindow $2 0
    GetDlgItem $2 $R1 1027
    ShowWindow $2 0
    GetDlgItem $2 $R1 1031
    ShowWindow $2 0
    GetDlgItem $hPb $R1 1004
  ${EndIf}
  ${NSD_CreateTimer} ProgTick 80
FunctionEnd

Function ProgTick
  ${If} $progTick >= 100
    Return
  ${EndIf}
  ${If} $hPb == 0
    Return
  ${EndIf}
  System::Call 'user32::SendMessageW(p$hPb,i0x0408,i0,i0)i.s'
  Pop $0
  ${If} $0 >= 100
    IntOp $progTick $progTick + 1
    ${If} $progTick >= 8
      StrCpy $progTick 999
      ${NSD_KillTimer} ProgTick
      GetDlgItem $0 $HWNDPARENT 1
      SendMessage $0 ${BM_CLICK} 0 0
    ${EndIf}
  ${EndIf}
FunctionEnd

Function instLeave
  StrCpy $progTick 999
  ${NSD_KillTimer} ProgTick
FunctionEnd

; ================= 第 3 页：完成 =================
Function PageDone
  Call HideStdButtons
  !insertmacro OPEN_BLACK_PAGE
  ${NSD_CreateBitmap} 150 118 126 36 ""
  Pop $1
  ${NSD_SetImage} $1 "$PLUGINSDIR\ui_finish.bmp" $img1
  ${NSD_OnClick} $1 OnFinishQuit
  nsDialogs::Show
FunctionEnd

Function OnFinishQuit
  Quit
FunctionEnd

Page custom PageMain
PageEx instfiles
  PageCallbacks instPre instShow instLeave
PageExEnd
Page custom PageDone

Section "Install"
  SetOutPath "$INSTDIR"
!ifdef NOPAYLOAD
  FileOpen $9 "$INSTDIR\fake.bin" w
  FileWrite $9 "fake payload for UI testing"
  FileClose $9
!else
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
!endif
  WriteUninstaller "$INSTDIR\Uninstall.exe"
!ifndef NOPAYLOAD
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
!endif
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
  Delete "$INSTDIR\fake.bin"
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

; 卸载程序保持默认界面
UninstPage uninstConfirm
UninstPage instfiles