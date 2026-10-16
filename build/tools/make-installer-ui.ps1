# 生成安装包自定义界面素材（圆角按钮 / 强调条）
# 运行后输出到 build/tools/installer/ui/*.bmp
param(
  [string]$OutDir = (Join-Path $PSScriptRoot "installer\ui")
)
Add-Type -AssemblyName System.Drawing

$ACCENT   = "#FF72B6"
$TEXT_ON  = "#1B0713"
$DIM_FILL = "#171717"
$DIM_EDGE = "#3A3A3A"
$DIM_TEXT = "#D9D9D9"

function New-RoundedPath([int]$x, [int]$y, [int]$w, [int]$h, [int]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function New-ButtonBmp {
  param([string]$Path, [int]$W, [int]$H, [string]$Fill, [string]$Edge, [string]$Label, [string]$LabelColor, [int]$FontSize, [bool]$Bold)
  $bmp = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml("#000000"))
  $gpath = New-RoundedPath 0 0 ($W - 1) ($H - 1) 9
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($Fill))
  $g.FillPath($brush, $gpath)
  if ($Edge -ne "") {
    $pen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml($Edge)), 1
    $g.DrawPath($pen, $gpath)
    $pen.Dispose()
  }
  $style = if ($Bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
  $font = New-Object System.Drawing.Font("Microsoft YaHei UI", $FontSize, $style, [System.Drawing.GraphicsUnit]::Pixel)
  $tbrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($LabelColor))
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF(0, 0, $W, $H)
  $g.DrawString($Label, $font, $tbrush, $rect, $fmt)
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $g.Dispose(); $bmp.Dispose()
  Write-Output ("{0} {1}x{2}" -f (Split-Path $Path -Leaf), $W, $H)
}

function New-BarBmp {
  param([string]$Path, [int]$W, [int]$H, [string]$Fill)
  $bmp = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml("#000000"))
  $gpath = New-RoundedPath 0 0 ($W - 1) ($H - 1) ([Math]::Min($H, 6) / 2)
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($Fill))
  $g.FillPath($brush, $gpath)
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $g.Dispose(); $bmp.Dispose()
  Write-Output ("{0} {1}x{2}" -f (Split-Path $Path -Leaf), $W, $H)
}

if (!(Test-Path $OutDir)) { New-Item -ItemType Directory -Force -Path $OutDir | Out-Null }
New-ButtonBmp -Path (Join-Path $OutDir "btn-install.bmp") -W 126 -H 36 -Fill $ACCENT -Edge "" -Label "立即安装" -LabelColor $TEXT_ON -FontSize 13 -Bold $true
New-ButtonBmp -Path (Join-Path $OutDir "btn-browse.bmp") -W 158 -H 36 -Fill $DIM_FILL -Edge $DIM_EDGE -Label "修改 exe 路径" -LabelColor $DIM_TEXT -FontSize 13 -Bold $false
New-ButtonBmp -Path (Join-Path $OutDir "btn-finish.bmp") -W 126 -H 36 -Fill $ACCENT -Edge "" -Label "完成安装" -LabelColor $TEXT_ON -FontSize 13 -Bold $true
New-BarBmp -Path (Join-Path $OutDir "accent.bmp") -W 36 -H 4 -Fill $ACCENT