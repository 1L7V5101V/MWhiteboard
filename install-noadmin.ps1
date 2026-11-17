#requires -Version 5.1
<#
  install-noadmin.ps1 —— 让已停用的 Microsoft Whiteboard 在本地离线继续用（零管理员）

  原理（三层，全部只动这一台机器的用户层）：
    1) 域名劫持：WebView2 的 --host-resolver-rules 把 whiteboard.cloud.microsoft
       在**白板自己的渲染进程内**指向 127.0.0.1:8443（不动 hosts、不动系统 DNS）
    2) 本地服务：server.py 在 8443 上跑 HTTPS，返回我们自己的单文件白板
    3) 证书：自签 CA 装进 CurrentUser\Root（用户级，不需要管理员）

  为了不破坏你现有的代理（127.0.0.1:7890），flags 里显式镜像了系统代理，
  只把 whiteboard.cloud.microsoft 加进 bypass 列表 —— 其他流量照旧走代理。

  用法:
    pwsh -File install-noadmin.ps1
    pwsh -File install-noadmin.ps1 -Uninstall
#>
[CmdletBinding()]
param(
  [switch]$Uninstall,
  [int]$Port = 8443,
  [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$taskName = 'wb-local-server'
$envName = 'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'
$aumid = 'Microsoft.Whiteboard_8wekyb3d8bbwe!Whiteboard'
$certCer = Join-Path $here 'cert.cer'
$serverPy = Join-Path $here 'server.py'
$vbs = Join-Path $here 'run-hidden.vbs'

function Get-Python {
  foreach ($c in @('C:\Users\HP\.local\bin\python.exe', "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe")) {
    if (Test-Path $c) { return $c }
  }
  $cmd = Get-Command python -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw '找不到 python.exe'
}

function Get-ServerProc {
  Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*server.py*" }
}

function Test-Port {
  try { (Invoke-WebRequest "https://127.0.0.1:$Port/health" -SkipCertificateCheck -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 }
  catch { $false }
}

# ══════════════════════════════════ 卸载
if ($Uninstall) {
  [Environment]::SetEnvironmentVariable($envName, $null, 'User')
  Write-Host '已清除 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS' -ForegroundColor Green

  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "已删除计划任务 $taskName"

  Get-ServerProc | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Write-Host '已停止本地服务'

  if (Test-Path $certCer) {
    $thumb = (Get-PfxCertificate -FilePath $certCer).Thumbprint
    # 注意：certutil -delstore / Remove-Item Cert:\ 都会弹 UI 确认（非交互会话里直接报错），
    # 用户根存储实际由注册表支撑，直接删键最干净、不弹窗。
    $regKey = "HKCU:\Software\Microsoft\SystemCertificates\Root\Certificates\$thumb"
    if (Test-Path $regKey) {
      Remove-Item -Path $regKey -Recurse -Force
      Write-Host "已从 CurrentUser\Root 移除证书 $thumb"
    } else {
      Write-Host "证书本来就不在 Root 存储里"
    }
  }
  if (Test-Path $vbs) { Remove-Item $vbs -Force }
  Get-Process MicrosoftWhiteboard -ErrorAction SilentlyContinue | Stop-Process -Force
  Write-Host '卸载完成（白板回到微软的停用页）' -ForegroundColor Yellow
  return
}

# ══════════════════════════════════ 安装
$py = Get-Python
Write-Host "python: $py"

# 1) 证书
$thumb = (Get-PfxCertificate -FilePath $certCer).Thumbprint
if (Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Thumbprint -eq $thumb }) {
  Write-Host "证书已信任: $thumb"
} else {
  & certutil -user -addstore Root $certCer 2>&1 | Out-Null
  if (-not (Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Thumbprint -eq $thumb })) { throw '证书安装失败' }
  Write-Host "证书已信任: $thumb" -ForegroundColor Green
}

# 2) 组装 WebView2 参数（镜像系统代理 + 只对目标域名走直连）
$rules = "MAP whiteboard.cloud.microsoft 127.0.0.1:$Port"
$flags = "--host-resolver-rules=`"$rules`""
$is = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
if ($is -and $is.ProxyEnable -eq 1 -and $is.ProxyServer) {
  $ps = $is.ProxyServer
  if ($ps -notmatch '=') { $ps = "http=$ps;https=$ps" }
  $flags += " --proxy-server=`"$ps`" --proxy-bypass-list=`"whiteboard.cloud.microsoft`""
  Write-Host "镜像系统代理: $ps"
}
[Environment]::SetEnvironmentVariable($envName, $flags, 'User')
Write-Host "已写入 $envName" -ForegroundColor Green
Write-Host "  $flags"

# 3) 隐藏启动器 + 登录自启
$vbsBody = @"
Set sh = CreateObject("WScript.Shell")
sh.Run """$py"" ""$serverPy"" --https-only --https-port $Port", 0, False
"@
[IO.File]::WriteAllText($vbs, $vbsBody, [Text.Encoding]::ASCII)
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
try {
  $act = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`""
  $trg = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERNAME"
  $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
  Register-ScheduledTask -TaskName $taskName -Action $act -Trigger $trg -Settings $set `
    -Description 'Local HTTPS server for offline Microsoft Whiteboard' -Force | Out-Null
  Write-Host "已注册登录自启任务: $taskName" -ForegroundColor Green
} catch {
  Write-Warning "计划任务创建失败（服务仍可手动启动）: $($_.Exception.Message)"
}

# 4) 起服务
if (Test-Port) {
  Write-Host "服务已在 127.0.0.1:$Port 运行"
} else {
  Get-ServerProc | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  & wscript.exe $vbs
  foreach ($i in 1..16) {
    Start-Sleep -Milliseconds 500
    if (Test-Port) { break }
  }
  if (Test-Port) { Write-Host "服务已启动: https://127.0.0.1:$Port" -ForegroundColor Green }
  else { throw "服务没起来，看 $here\server.log" }
}

# 5) 重启白板
Get-Process MicrosoftWhiteboard -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 800
if (-not $NoLaunch) {
  Start-Process 'explorer.exe' -ArgumentList "shell:AppsFolder\$aumid"
  Write-Host '已启动 Microsoft Whiteboard' -ForegroundColor Green
}
