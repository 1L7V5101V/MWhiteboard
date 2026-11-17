#requires -Version 7.0
<#
  teardown.ps1 — 撤销 setup.ps1 的全部改动
    1. 从 hosts 移除 wb-local 映射
    2. 从 CurrentUser\Root 移除自签证书
    3. 停掉本地服务
    4. 若之前停过 VMwareHostd，则重新启动
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Continue'
$here = $PSScriptRoot
$hosts = Join-Path $env:windir 'System32\drivers\etc\hosts'
$stateFile = Join-Path $here '.state.json'
$certCer = Join-Path $here 'cert.cer'

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  (New-Object Security.Principal.WindowsPrincipal $id).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
  Write-Host '需要管理员权限修改 hosts，正在提权...' -ForegroundColor Yellow
  Start-Process -FilePath (Get-Process -Id $PID).Path -Verb RunAs `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
  return
}

Write-Host "`n=== 撤销 Whiteboard 本地化 ===" -ForegroundColor White

# 1. hosts
$lines = Get-Content $hosts -ErrorAction SilentlyContinue
$inside = $false
$out = foreach ($l in $lines) {
  if ($l -match '# >>> wb-local') { $inside = $true; continue }
  if ($l -match '# <<< wb-local') { $inside = $false; continue }
  if (-not $inside) { $l }
}
Set-Content -Path $hosts -Value $out -Encoding ascii
Write-Host '  [OK] hosts 已清理' -ForegroundColor Green
try { ipconfig /flushdns | Out-Null } catch {}

# 2. 证书
if (Test-Path $certCer) {
  $thumb = (Get-PfxCertificate -FilePath $certCer).Thumbprint
  Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Thumbprint -eq $thumb } |
    Remove-Item -Force -ErrorAction SilentlyContinue
  Write-Host "  [OK] 已移除受信任证书 $thumb" -ForegroundColor Green
}

# 3. 服务
Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*wb-local*server.py*' } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Host "  [OK] 已停止服务 pid=$($_.ProcessId)" -ForegroundColor Green
  }

# 4. VMware
if (Test-Path $stateFile) {
  try {
    $st = Get-Content $stateFile -Raw | ConvertFrom-Json
    if ($st.stoppedService -eq 'VMwareHostd') {
      Start-Service -Name VMwareHostd -ErrorAction SilentlyContinue
      Write-Host '  [OK] VMwareHostd 已重新启动' -ForegroundColor Green
    }
  } catch {}
  Remove-Item $stateFile -Force -ErrorAction SilentlyContinue
}

Write-Host "`n已恢复原状（应用本身与本地数据未改动）。`n" -ForegroundColor Green
