#requires -Version 5.1
<#
  install-scoped.ps1 —— A+ 可选升级：把 WebView2 参数收敛到「只对白板生效」

  和 install-noadmin.ps1 的区别只有一个：
    零管理员版把 flags 放在用户环境变量里（对所有 WebView2 进程都可见，虽然实际作用域很窄）；
    这个版本写进 WebView2 官方支持的 per-app 策略键，值名 = MicrosoftWhiteboard.exe，
    于是只有白板这个应用会拿到这些 flags，别的 WebView2 应用连看都看不到。

  代价：HKCU\Software\Policies 对普通用户只读（Administrators/SYSTEM 才有写权限），
  所以需要一次 UAC。当前 shell 里 Start-Process -Verb RunAs 会直接 ERROR_CANCELLED，
  请在终端里手动执行，或者右键这个文件 → 使用 PowerShell 运行 → 弹窗点「是」。

  用法:
    pwsh -File install-scoped.ps1
    pwsh -File install-scoped.ps1 -Uninstall
#>
[CmdletBinding()]
param(
  [switch]$Uninstall,
  [int]$Port = 8443
)

$ErrorActionPreference = 'Stop'
$exeName = 'MicrosoftWhiteboard.exe'
$aumid = 'Microsoft.Whiteboard_8wekyb3d8bbwe!Whiteboard'
$policyKey = 'HKCU:\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
$envName = 'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'

$isAdmin = (New-Object Security.Principal.WindowsPrincipal(
  [Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  Write-Host '这个脚本要写 HKCU\Software\Policies，需要管理员权限。' -ForegroundColor Yellow
  Write-Host '请在能弹 UAC 的终端里执行：'
  Write-Host "  pwsh -File `"$PSCommandPath`"$(if ($Uninstall) { ' -Uninstall' })" -ForegroundColor Cyan
  try {
    $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Port', $Port)
    if ($Uninstall) { $a += '-Uninstall' }
    Start-Process pwsh -Verb RunAs -ArgumentList $a -Wait
  } catch {
    Write-Warning "提权被取消（$($_.Exception.Message)），策略没写。"
  }
  return
}

if ($Uninstall) {
  if (Test-Path $policyKey) {
    foreach ($n in @($exeName, $aumid)) {
      Remove-ItemProperty -Path $policyKey -Name $n -ErrorAction SilentlyContinue
    }
    if (-not (Get-Item $policyKey).Property) { Remove-Item $policyKey -Force -ErrorAction SilentlyContinue }
  }
  Write-Host '已移除 per-app WebView2 策略' -ForegroundColor Green
  Write-Host '（如果之前用 install-noadmin.ps1 装的，还要跑它的 -Uninstall 清证书和服务）'
  return
}

# 组装 flags：镜像系统代理 + 只把目标域名放进 bypass
$rules = "MAP whiteboard.cloud.microsoft 127.0.0.1:$Port"
$flags = "--host-resolver-rules=`"$rules`""
$is = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
if ($is -and $is.ProxyEnable -eq 1 -and $is.ProxyServer) {
  $ps = $is.ProxyServer
  if ($ps -notmatch '=') { $ps = "http=$ps;https=$ps" }
  $flags += " --proxy-server=`"$ps`" --proxy-bypass-list=`"whiteboard.cloud.microsoft`""
}

New-Item -Path $policyKey -Force | Out-Null
foreach ($n in @($exeName, $aumid)) {
  New-ItemProperty -Path $policyKey -Name $n -Value $flags -PropertyType String -Force | Out-Null
}
Write-Host "已写入 per-app 策略：$policyKey" -ForegroundColor Green
Write-Host "  $exeName = $flags"

# 环境变量版会让所有 WebView2 应用都拿到 flags，装了 per-app 就把它清掉
[Environment]::SetEnvironmentVariable($envName, $null, 'User')
Write-Host '已清除全局环境变量（改由 per-app 策略接管）'

Get-Process MicrosoftWhiteboard -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 800
Start-Process 'explorer.exe' -ArgumentList "shell:AppsFolder\$aumid"
Write-Host '已重启 Microsoft Whiteboard' -ForegroundColor Green
