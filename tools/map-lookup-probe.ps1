# 地图数据接口测试（临时探针，非网站代码）
#
# 用法（在本项目根目录）：
#   powershell -ExecutionPolicy Bypass -File tools\map-lookup-probe.ps1
#   powershell -ExecutionPolicy Bypass -File tools\map-lookup-probe.ps1 0622-6707-7933 4150-7311-8813
#
# 作用：在不受浏览器 CORS 限制的情况下，确认这台电脑的网络能不能读到地图数据，
#       并把接口真实返回的字段打印出来。

param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Codes
)

$ErrorActionPreference = 'Stop'
$api = 'https://api2.fallguysdb.info/api/creative/'
$headers = @{
  'Accept'          = 'application/json, text/plain, */*'
  'Accept-Language' = 'en-US,en;q=0.9'
  'Origin'          = 'https://fallguys-db.pages.dev'
  'Referer'         = 'https://fallguys-db.pages.dev/'
}

if (-not $Codes -or $Codes.Count -eq 0) {
  $file = Join-Path $PSScriptRoot '..\fallguys-cms-master\dlc_levels.json'
  if (Test-Path $file) {
    $rows = Get-Content $file -Raw | ConvertFrom-Json
    $Codes = @()
    $step = [Math]::Max(1, [Math]::Floor($rows.Count / 4))
    for ($i = 0; $i -lt $rows.Count -and $Codes.Count -lt 4; $i += $step) {
      if ($rows[$i].sharecode) { $Codes += $rows[$i].sharecode }
    }
  }
}
if (-not $Codes -or $Codes.Count -eq 0) { Write-Host '没有可测试的分享码。'; return }

Write-Host "接口: ${api}{分享码}.json"
Write-Host ("测试分享码: " + ($Codes -join ', '))
Write-Host ''

foreach ($code in $Codes) {
  $url = $api + $code + '.json'
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $resp = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -TimeoutSec 30
    $sw.Stop()
    Write-Host ("--- {0} -> HTTP {1} ({2} ms, {3} bytes)" -f $code, $resp.StatusCode, $sw.ElapsedMilliseconds, $resp.RawContentLength) -ForegroundColor Green
    try { $json = $resp.Content | ConvertFrom-Json } catch { Write-Host '    返回不是 JSON'; continue }
    if ($json.ok -ne $true) { Write-Host ('    ok 不为 true: ' + ($resp.Content.Substring(0, [Math]::Min(300, $resp.Content.Length)))); continue }
    $level = $json.data.level
    $snap  = $json.data.snapshot
    Write-Host ''
    Write-Host '=== 关键字段 ===' -ForegroundColor Cyan
    Write-Host ("  level.title            : {0}" -f $level.title)
    Write-Host ("  level.share_code       : {0}" -f $level.share_code)
    Write-Host ("  level.play_count       : {0}   <-- 游玩数" -f $level.play_count) -ForegroundColor Yellow
    Write-Host ("  snapshot.stats.likes   : {0}   <-- 点赞数" -f $snap.stats.likes) -ForegroundColor Yellow
    Write-Host ("  snapshot.stats.dislikes: {0}   <-- 点踩数" -f $snap.stats.dislikes) -ForegroundColor Yellow
    Write-Host ("  level.max_players      : {0}" -f $level.max_players)
    Write-Host ("  level.creator_tags     : {0}" -f ($level.creator_tags -join ', '))
    Write-Host ("  meta.status            : {0}" -f $snap.version_metadata.status)
    Write-Host ("  meta.theme / mode      : {0} / {1}" -f $snap.version_metadata.level_theme_id, $snap.version_metadata.game_mode_id)
    Write-Host ("  meta.last_modified     : {0}" -f $snap.version_metadata.last_modified_date)
    Write-Host ("  预览图数量             : {0}" -f (@($snap.images.PreviewImage).Count))
    Write-Host ''
    Write-Host '=== snapshot 顶层字段 ===' -ForegroundColor Cyan
    Write-Host ('  ' + (($snap.PSObject.Properties.Name) -join ', '))
    Write-Host '=== level 顶层字段 ===' -ForegroundColor Cyan
    Write-Host ('  ' + (($level.PSObject.Properties.Name) -join ', '))
    break
  } catch {
    $sw.Stop()
    $status = $null
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    if ($status) {
      Write-Host ("--- {0} -> HTTP {1} ({2} ms)" -f $code, $status, $sw.ElapsedMilliseconds) -ForegroundColor Red
      if ($status -eq 403) { Write-Host '    被 Cloudflare 拦了（IP 风控），不是代码问题。' }
    } else {
      Write-Host ("--- {0} -> 请求失败: {1}" -f $code, $_.Exception.Message) -ForegroundColor Red
    }
  }
}