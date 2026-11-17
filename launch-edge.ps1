#requires -Version 7.0
<#
  launch-edge.ps1 — 零改动、不需要管理员的白板入口

  把 whiteboard.html 当成独立应用窗口打开（Edge 的 --app 模式）：
  没有地址栏、没有标签页、有压感、数据存在独立 profile 里。

  用法:
    pwsh -File launch-edge.ps1
    pwsh -File launch-edge.ps1 -Port 8443 -Width 1600 -Height 1000
#>
[CmdletBinding()]
param(
  [int]$Port = 8443,
  [int]$Width = 1600,
  [int]$Height = 1000
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot

# 1. 服务没起就起一个
$alive = $false
try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health" -UseBasicParsing -TimeoutSec 2
  $alive = ($r.StatusCode -eq 200)
} catch { $alive = $false }

if (-not $alive) {
  Write-Host '启动本地服务 ...' -ForegroundColor Yellow
  $py = 'C:\Users\HP\.local\bin\python.exe'
  if (-not (Test-Path $py)) { $py = (Get-Command python).Source }
  Start-Process -FilePath $py -ArgumentList @((Join-Path $here 'server.py'), '--port', $Port) `
    -WorkingDirectory $here -WindowStyle Hidden
  foreach ($i in 1..12) {
    Start-Sleep -Milliseconds 500
    try {
      if ((Invoke-WebRequest "http://127.0.0.1:$Port/health" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { $alive = $true; break }
    } catch {}
  }
}
if (-not $alive) { throw "本地服务没起来，看 $here\server.log" }

# 2. 打开 app 窗口（独立 profile，数据不被主浏览器清缓存带走）
$edge = @(
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw '找不到 msedge.exe' }

$prof = Join-Path $env:LOCALAPPDATA 'wb-local-edge'
$args = @(
  "--app=http://127.0.0.1:$Port/",
  "--user-data-dir=$prof",
  "--window-size=$Width,$Height",
  '--no-first-run',
  '--no-default-browser-check'
)
Start-Process -FilePath $edge -ArgumentList $args
Write-Host "已打开白板窗口  http://127.0.0.1:$Port/  (profile: $prof)" -ForegroundColor Green
