#requires -Version 7.0
<#
  backup.ps1 — 把 Whiteboard 的安装包和本地数据整包备份，防止商店下架/自动更新后彻底找不回

  用法:
    pwsh -File backup.ps1                     # 默认备份到 D:\wb-backup\<日期>
    pwsh -File backup.ps1 -Dest E:\wb-backup

  备份内容:
    pkg\      C:\Program Files\WindowsApps\Microsoft.Whiteboard_*（可读，无需管理员）
    data\     %LOCALAPPDATA%\Packages\Microsoft.Whiteboard_8wekyb3d8bbwe
    boards\   抢救出来的白板缩略图
    restore.md 重新注册成开发包的命令
#>
[CmdletBinding()]
param(
  [string]$Dest
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
if (-not $Dest) { $Dest = 'D:\wb-backup' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$root = Join-Path $Dest $stamp

$pfn = 'Microsoft.Whiteboard_8wekyb3d8bbwe'
$pkg = Get-AppxPackage -Name 'Microsoft.Whiteboard' 2>$null
if (-not $pkg) {
  # pwsh 7 里 Appx 模块不可用时退回到 powershell.exe
  $line = & powershell.exe -NoProfile -Command "(Get-AppxPackage -Name Microsoft.Whiteboard).InstallLocation"
  $pkgPath = ($line | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1)
} else {
  $pkgPath = $pkg.InstallLocation
}
if (-not $pkgPath) { throw '找不到已安装的 Microsoft.Whiteboard 包' }

$dataPath = Join-Path $env:LOCALAPPDATA "Packages\$pfn"

New-Item -ItemType Directory -Force -Path $root | Out-Null
Write-Host "`n备份到: $root`n" -ForegroundColor Cyan
Write-Host "  包:   $pkgPath"
Write-Host "  数据: $dataPath`n"

Write-Host '复制安装包 ...' -ForegroundColor Yellow
robocopy $pkgPath (Join-Path $root 'pkg') /E /NFL /NDL /NJH /NJS /R:1 /W:1 | Out-Null
Write-Host '复制本地数据 ...' -ForegroundColor Yellow
robocopy $dataPath (Join-Path $root 'data') /E /NFL /NDL /NJH /NJS /R:1 /W:1 | Out-Null

if (Test-Path (Join-Path $here 'boards')) {
  Write-Host '复制抢救缩略图 ...' -ForegroundColor Yellow
  robocopy (Join-Path $here 'boards') (Join-Path $root 'boards') /E /NFL /NDL /NJH /NJS | Out-Null
  Copy-Item (Join-Path $here 'gallery.html') $root -ErrorAction SilentlyContinue
  Copy-Item (Join-Path $here 'boards.json') $root -ErrorAction SilentlyContinue
}

$size = (Get-ChildItem $root -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
$note = @"
# Whiteboard 备份 $stamp

- pkg\    原安装包（$(Split-Path $pkgPath -Leaf)）
- data\   本地 profile（IndexedDB 缩略图 / 设置 / token 缓存）
- boards\ 抢救出的白板缩略图

## 包被商店下架或更新后，如何从备份重新注册

管理员 PowerShell:

    Copy-Item pkg\* "C:\Program Files\WindowsApps\Microsoft.Whiteboard_56.20201.588.0_x64__8wekyb3d8bbwe" -Recurse -Force
    Add-AppxPackage -Register "C:\Program Files\WindowsApps\Microsoft.Whiteboard_56.20201.588.0_x64__8wekyb3d8bbwe\AppxManifest.xml" -DisableDevelopmentMode

若提示需要开发者模式：设置 → 系统 → 开发者选项 → 开发人员模式。
同 PackageFamilyName 重新注册会继续使用原来的应用数据目录。

## 恢复本地数据

    robocopy data "$env:LOCALAPPDATA\Packages\Microsoft.Whiteboard_8wekyb3d8bbwe" /E
"@
Set-Content -Path (Join-Path $root 'restore.md') -Value $note -Encoding utf8

Write-Host ("`n完成，共 {0:N1} MB -> {1}`n" -f $size, $root) -ForegroundColor Green
