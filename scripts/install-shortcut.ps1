$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$startScript = Join-Path $PSScriptRoot 'start.ps1'
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'SUOWANG.lnk'
$powershell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powershell
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = '所往 SUOWANG · 人生主线驾驶舱'
$shortcut.IconLocation = "$env:SystemRoot/System32/shell32.dll,18"
$shortcut.Save()

Write-Output "SUOWANG desktop shortcut created: $shortcutPath"
