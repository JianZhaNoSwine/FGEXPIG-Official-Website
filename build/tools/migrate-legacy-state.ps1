# migrate-legacy-state.ps1
# 把旧版（Electron 时代）%APPDATA%\fgexpig-desktop\Local Storage 里的 localStorage 迁移进新版（Tauri）的文件：
#   fgexpig.mapstats.v1 → 与现有地图数据【并集合并】（每个地图码保留 at 更新的一条，days 取更新日期）
# 背景：新版 WebView2 的 localStorage 在 %LOCALAPPDATA%\cc.fgexpig.desktop\EBWebView，且按 origin
#       （http://127.0.0.1:<端口>）隔离；换端口/换架构后旧数据不会自动带过来，地图数据是"只累加"
#       的历史数据，从零开始会看起来像丢了一大半。
# 用法： powershell -NoProfile -ExecutionPolicy Bypass -File build\tools\migrate-legacy-state.ps1

$ErrorActionPreference = 'Stop'
$appData   = Join-Path $env:APPDATA 'fgexpig-desktop'
$legacyDir = Join-Path $appData 'Local Storage\leveldb'
$mapFile   = Join-Path $appData 'mapstats.json'
$stateFile = Join-Path $appData 'state.json'
$mapKey    = 'fgexpig.mapstats.v1'

function Get-DayRank([string]$text) {
  $m = [regex]::Match([string]$text, '^(?<y>\d+)-(?<m>\d+)-(?<d>\d+)$')
  if (-not $m.Success) { return 0 }
  return ([int]$m.Groups['y'].Value * 10000 + [int]$m.Groups['m'].Value * 100 + [int]$m.Groups['d'].Value)
}

# 从一段文本里抽出所有 {"codes": ...} 的完整 JSON（大括号配平）
function Get-MapStatsBlobs([string]$text) {
  $out = @()
  $idx = 0
  while (($idx = $text.IndexOf('{"codes":', $idx)) -ge 0) {
    $depth = 0; $i = $idx; $end = -1
    while ($i -lt $text.Length) {
      $c = $text[$i]
      if ($c -eq '{') { $depth++ } elseif ($c -eq '}') { $depth--; if ($depth -eq 0) { $end = $i; break } }
      $i++
    }
    if ($end -lt 0) { break }
    $out += $text.Substring($idx, $end - $idx + 1)
    $idx = $end + 1
  }
  return $out
}

# 收集所有来源
$sources = @()
if (Test-Path $legacyDir) {
  foreach ($f in (Get-ChildItem $legacyDir -File -Force | Where-Object { $_.Extension -in @('.log', '.ldb') })) {
    $text = [System.Text.Encoding]::GetEncoding(28591).GetString([System.IO.File]::ReadAllBytes($f.FullName))
    foreach ($blob in (Get-MapStatsBlobs $text)) { $sources += @{ name = 'legacy-leveldb/' + $f.Name; json = $blob } }
  }
}
if (Test-Path $mapFile) { foreach ($blob in (Get-MapStatsBlobs ([System.IO.File]::ReadAllText($mapFile)))) { $sources += @{ name = 'mapstats.json'; json = $blob } } }
if (Test-Path $stateFile) {
  try {
    $stateObj = [System.IO.File]::ReadAllText($stateFile) | ConvertFrom-Json
    $stateMap = $stateObj.PSObject.Properties[$mapKey]
    if ($stateMap) { foreach ($blob in (Get-MapStatsBlobs ([string]$stateMap.Value))) { $sources += @{ name = 'state.json'; json = $blob } } }
  } catch { Write-Output ('[warn] state.json 读取失败：' + $_.Exception.Message) }
}

if ($sources.Count -eq 0) { Write-Output '没有找到任何地图数据来源，退出。'; exit 0 }

# 并集合并
$codes = @{}
$days  = @{}
$resumeAt = 0
foreach ($s in $sources) {
  try { $obj = $s.json | ConvertFrom-Json } catch { continue }
  $n = 0
  if ($obj.codes) {
    foreach ($p in $obj.codes.PSObject.Properties) {
      $n++
      $cur = $codes[$p.Name]
      if (-not $cur) { $codes[$p.Name] = $p.Value; continue }
      $curAt = 0; $newAt = 0
      if ($cur.at) { $curAt = [double]$cur.at }
      if ($p.Value.at) { $newAt = [double]$p.Value.at }
      if ($newAt -ge $curAt) { $codes[$p.Name] = $p.Value }
    }
  }
  if ($obj.days) {
    foreach ($p in $obj.days.PSObject.Properties) {
      if (-not $days.ContainsKey($p.Name) -or (Get-DayRank $p.Value) -gt (Get-DayRank $days[$p.Name])) { $days[$p.Name] = [string]$p.Value }
    }
  }
  if ($obj.resumeAt -and [double]$obj.resumeAt -gt $resumeAt) { $resumeAt = [double]$obj.resumeAt }
  Write-Output ('  来源 {0,-28} 条目 {1}' -f $s.name, $n)
}

$merged = [pscustomobject]@{ codes = $codes; days = $days; resumeAt = $resumeAt }
$mergedJson = $merged | ConvertTo-Json -Compress -Depth 10
Write-Output ('合并结果：地图条目 {0} 条' -f $codes.Count)

# 写 mapstats.json
[System.IO.File]::WriteAllText($mapFile, $mergedJson, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ('已写入 ' + $mapFile)

# 写 state.json 的 map key（其它 key 原样保留）
if (Test-Path $stateFile) {
  try {
    $stateObj = [System.IO.File]::ReadAllText($stateFile) | ConvertFrom-Json
    $found = $false
    foreach ($p in $stateObj.PSObject.Properties) { if ($p.Name -eq $mapKey) { $p.Value = $mergedJson; $found = $true } }
    if (-not $found) { $stateObj | Add-Member -NotePropertyName $mapKey -NotePropertyValue $mergedJson }
    [System.IO.File]::WriteAllText($stateFile, ($stateObj | ConvertTo-Json -Compress -Depth 20), (New-Object System.Text.UTF8Encoding($false)))
    Write-Output ('已写入 ' + $stateFile)
  } catch { Write-Output ('[warn] state.json 写入失败：' + $_.Exception.Message) }
}
