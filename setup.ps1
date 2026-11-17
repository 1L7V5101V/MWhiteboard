#requires -Version 7.0
<#
  setup.ps1 — 让已退役的 Microsoft Whiteboard 外壳在本地离线继续可用

  做四件事：
    1. 生成自签证书并信任到「当前用户\受信任的根证书颁发机构」
    2. 把 whiteboard.cloud.microsoft 等域名指到 127.0.0.1
    3. 释放 443（若被 VMware Workstation Server 占用则临时停掉）
    4. 启动 wb-local 服务并打开 Whiteboard 应用

  参数：
    -SkipHosts   不改 hosts（只跑本地 http://127.0.0.1:8443 的 Edge 版）
    -SkipApp     不自动启动应用
    -Port 8443   http 监听端口

  回滚：teardown.ps1
#>
[CmdletBinding()]
param(
  [switch]$SkipHosts,
  [switch]$SkipApp,
  [int]$Port = 8443
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$hosts = Join-Path $env:windir 'System32\drivers\etc\hosts'
$marker = '# >>> wb-local'
$domains = @(
  'whiteboard.cloud.microsoft',
  'whiteboard.microsoft.com',
  'whiteboard.ms',
  'wbd.ms'
)
$openssl = 'C:\Program Files\Git\usr\bin\openssl.exe'
$stateFile = Join-Path $here '.state.json'

function Say($m) { Write-Host "  $m" }
function Head($m) { Write-Host "`n== $m" -ForegroundColor Cyan }
function Ok($m) { Write-Host "  [OK] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [!] $m" -ForegroundColor Yellow }

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  (New-Object Security.Principal.WindowsPrincipal $id).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-443Free {
  $c = Get-NetTCPConnection -LocalPort 443 -State Listen -ErrorAction SilentlyContinue
  if (-not $c) { return $true }
  $pids = ($c | Select-Object -ExpandProperty OwningProcess -Unique)
  $svc = Get-CimInstance Win32_Service -ErrorAction SilentlyContinue |
         Where-Object { $pids -contains $_.ProcessId }
  return @{ Free = $false; Pids = $pids; Services = $svc }
}

# ---------------------------------------------------------------- 需要管理员时自提权
if (-not $SkipHosts -and -not (Test-Admin)) {
  Write-Host "需要管理员权限来修改 hosts 并释放 443，正在提权..." -ForegroundColor Yellow
  $args2 = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Port', $Port)
  if ($SkipApp) { $args2 += '-SkipApp' }
  Start-Process -FilePath (Get-Process -Id $PID).Path -Verb RunAs -ArgumentList $args2
  return
}

Write-Host "`n=== Whiteboard 本地化部署 ===" -ForegroundColor White
Say "目录: $here"
Say ("管理员: " + (Test-Admin))

# ---------------------------------------------------------------- 1. 证书
Head '1/4  自签证书'
$certPem = Join-Path $here 'cert.pem'
$keyPem = Join-Path $here 'key.pem'
$certCer = Join-Path $here 'cert.cer'

if (-not (Test-Path $certPem) -or -not (Test-Path $keyPem)) {
  if (-not (Test-Path $openssl)) { throw "找不到 openssl: $openssl（装个 Git for Windows 即可）" }
  $san = ($domains | ForEach-Object { "DNS:$_" }) -join ','
  & $openssl req -x509 -newkey rsa:2048 -nodes -days 3650 `
      -keyout $keyPem -out $certPem `
      -subj '/CN=whiteboard.cloud.microsoft/O=wb-local' `
      -addext "subjectAltName=$san" `
      -addext 'basicConstraints=critical,CA:TRUE' `
      -addext 'keyUsage=digitalSignature,keyEncipherment,keyCertSign' 2>$null
  if (-not (Test-Path $certPem)) { throw '证书生成失败' }
  Ok "已生成 cert.pem / key.pem"
} else {
  Ok '证书已存在，复用'
}
& $openssl x509 -in $certPem -outform der -out $certCer 2>$null

$thumb = (Get-PfxCertificate -FilePath $certCer).Thumbprint
$inRoot = Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Thumbprint -eq $thumb }
if (-not $inRoot) {
  # certutil 装 CurrentUser\Root 不会弹交互确认，Import-Certificate 在非交互会话会报「不允许使用 UI」
  & certutil -user -addstore Root $certCer 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Warn 'certutil 安装证书失败，可手动双击 cert.cer 导入「受信任的根证书颁发机构」' }
  else { Ok "已信任到 CurrentUser\Root ($thumb)" }
} else {
  Ok "证书已在信任列表 ($thumb)"
}

# ---------------------------------------------------------------- 2. hosts
if (-not $SkipHosts) {
  Head '2/4  hosts 重定向'
  $lines = Get-Content $hosts -ErrorAction SilentlyContinue
  $kept = $lines | Where-Object { $_ -notmatch [regex]::Escape($marker) -and $_ -notmatch '# <<< wb-local' }
  # 去掉旧的同名映射行
  $kept = $kept | Where-Object {
    $t = ($_ -replace '#.*$', '').Trim()
    if (-not $t) { return $true }
    $parts = $t -split '\s+'
    -not ($parts.Count -ge 2 -and $domains -contains $parts[1])
  }
  $block = @($marker + ' (managed by wb-local, remove with teardown.ps1)')
  $domains | ForEach-Object { $block += "127.0.0.1`t$_" }
  $block += '# <<< wb-local'
  Set-Content -Path $hosts -Value ($kept + $block) -Encoding ascii
  Ok ("已写入 " + $domains.Count + ' 条映射')
  try { ipconfig /flushdns | Out-Null } catch {}
} else {
  Head '2/4  hosts 重定向（已跳过）'
  Warn '仅本地 http 模式：用 Edge app 窗口打开白板'
}

# ---------------------------------------------------------------- 3. 443
Head '3/4  端口 443'
$state = @{ stoppedService = $null }
if (Test-Path $stateFile) {
  try { $old = Get-Content $stateFile -Raw | ConvertFrom-Json; if ($old.stoppedService) { $state.stoppedService = $old.stoppedService } } catch {}
}
$chk = Test-443Free
if ($chk -is [bool]) {
  Ok '443 空闲'
} else {
  $names = @($chk.Services | Select-Object -ExpandProperty Name)
  Warn ("443 被占用: " + ($names -join ', '))
  if ($names -contains 'VMwareHostd' -and (Test-Admin)) {
    Stop-Service -Name VMwareHostd -Force -ErrorAction SilentlyContinue
    $state.stoppedService = 'VMwareHostd'
    Start-Sleep -Milliseconds 800
    Ok '已临时停止 VMwareHostd（teardown.ps1 会恢复）'
  } else {
    Warn '无法自动释放，HTTPS 外壳模式不可用；本地 http 模式仍然可用'
  }
}
$state | ConvertTo-Json | Set-Content -Path $stateFile -Encoding utf8

# ---------------------------------------------------------------- 4. 启动服务
Head '4/4  启动本地服务'
Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*wb-local*server.py*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

$py = 'C:\Users\HP\.local\bin\python.exe'
if (-not (Test-Path $py)) { $py = (Get-Command python).Source }
$argList = @((Join-Path $here 'server.py'), '--port', $Port)
Start-Process -FilePath $py -ArgumentList $argList -WorkingDirectory $here -WindowStyle Hidden
Start-Sleep -Seconds 2

$ok = $false
foreach ($i in 1..10) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health" -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch { Start-Sleep -Milliseconds 600 }
}
if ($ok) { Ok "本地服务已就绪 (http://127.0.0.1:$Port/)" } else { Warn '服务未响应，见 server.log' }

# ---------------------------------------------------------------- 启动应用
if (-not $SkipApp) {
  Head '打开 Whiteboard'
  if (-not $SkipHosts -and $chk -isnot [bool] -and $state.stoppedService -ne 'VMwareHostd') {
    Warn '443 未释放，官方外壳可能仍显示退役页'
  }
  try {
    Start-Process 'explorer.exe' 'shell:AppsFolder\Microsoft.Whiteboard_8wekyb3d8bbwe!Whiteboard'
    Ok '已启动 Microsoft.Whiteboard（外壳 + 本地白板页）'
  } catch {
    Warn "启动失败: $_"
  }
  Start-Sleep -Seconds 1
  try { Start-Process "http://127.0.0.1:$Port/" ; Ok '同时打开了浏览器版（备用）' } catch {}
}

Write-Host "`n完成。撤销：pwsh -File `"$here\teardown.ps1`"`n" -ForegroundColor Green
