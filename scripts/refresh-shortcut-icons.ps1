[CmdletBinding(SupportsShouldProcess)]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceIcon = Join-Path $projectRoot 'assets/brand/suowang-app-icon.ico'
if (-not (Test-Path -LiteralPath $sourceIcon -PathType Leaf)) { throw "Missing icon: $sourceIcon" }

$shell = New-Object -ComObject WScript.Shell
if (-not ('SuowangShortcutNotification' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SuowangShortcutNotification {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    public static extern void SHChangeNotify(int eventId, uint flags, string path, IntPtr unused);
}
'@
}

function Send-ShortcutIconRefresh([string]$Path) {
    # SHCNE_UPDATEITEM + SHCNF_PATHW + SHCNF_FLUSH: invalidate just this item.
    # Saving a .lnk or loading its icon in another process does not refresh Explorer's view.
    [SuowangShortcutNotification]::SHChangeNotify(0x2000, 0x1005, [IO.Path]::GetFullPath($Path), [IntPtr]::Zero)
}

function Get-IconFileHash([string]$Path) {
    # Read directly so Windows PowerShell's WhatIf preference cannot suppress hashing.
    $stream = [IO.File]::OpenRead($Path)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '') }
    finally { $stream.Dispose(); $sha.Dispose() }
}
$searchRoots = @(
    [Environment]::GetFolderPath('Desktop'),
    [Environment]::GetFolderPath('CommonDesktopDirectory'),
    (Join-Path ([Environment]::GetFolderPath('Programs')) '所往 SUOWANG'),
    (Join-Path ([Environment]::GetFolderPath('Programs')) '所往 SUOWANG Lite')
)
$candidates = @($searchRoots | Where-Object { Test-Path -LiteralPath $_ } | ForEach-Object {
    Get-ChildItem -LiteralPath $_ -Filter '*SUOWANG*.lnk' -File
} | Sort-Object FullName -Unique)

$eligible = @($candidates | Where-Object {
    $link = $shell.CreateShortcut($_.FullName)
    $executable = [IO.Path]::GetFileName($link.TargetPath)
    $executable -in @('SUOWANG.exe', 'SUOWANG-Lite.exe') -and (Test-Path -LiteralPath $link.TargetPath -PathType Leaf)
})
if ($eligible.Count -eq 0) { Write-Output 'No valid installed SUOWANG shortcuts found.'; return }

# Independent of the checkout and install version; never touch user databases.
$brandRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'SUOWANG/brand'
$sourceHash = Get-IconFileHash $sourceIcon
$hash = $sourceHash.Substring(0, 12).ToLowerInvariant()
$installedIcon = Join-Path $brandRoot "suowang-scenic-$hash.ico"
$backupRoot = Join-Path $brandRoot ('shortcut-backups/' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
$updated = 0
$refreshed = 0
foreach ($candidate in $eligible) {
    $shortcut = $shell.CreateShortcut($candidate.FullName)
    if ($shortcut.IconLocation -eq "$installedIcon,0" -and (Test-Path -LiteralPath $installedIcon) -and
        (Get-IconFileHash $installedIcon) -eq $sourceHash) {
        if ($PSCmdlet.ShouldProcess($candidate.FullName, 'Refresh the existing shortcut icon in Windows Explorer')) {
            Send-ShortcutIconRefresh $candidate.FullName
            $refreshed++
        }
        continue
    }
    if (-not $PSCmdlet.ShouldProcess($candidate.FullName, 'Back up shortcut and update only its icon')) { continue }
    New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
    Copy-Item -LiteralPath $sourceIcon -Destination $installedIcon -Force
    Copy-Item -LiteralPath $candidate.FullName -Destination (Join-Path $backupRoot "$updated.lnk")
    Add-Content -LiteralPath (Join-Path $backupRoot 'original-paths.txt') -Value "$updated`t$($candidate.FullName)" -Encoding UTF8
    $original = @($shortcut.TargetPath, $shortcut.Arguments, $shortcut.WorkingDirectory, $shortcut.Description, $shortcut.WindowStyle, $shortcut.Hotkey)
    $shortcut.IconLocation = "$installedIcon,0"
    $shortcut.Save()
    $saved = $shell.CreateShortcut($candidate.FullName)
    $actual = @($saved.TargetPath, $saved.Arguments, $saved.WorkingDirectory, $saved.Description, $saved.WindowStyle, $saved.Hotkey)
    if (($original | ConvertTo-Json -Compress) -cne ($actual | ConvertTo-Json -Compress) -or $saved.IconLocation -ne "$installedIcon,0") {
        Copy-Item -LiteralPath (Join-Path $backupRoot "$updated.lnk") -Destination $candidate.FullName -Force
        throw "Shortcut verification failed; original restored: $($candidate.FullName)"
    }
    $updated++
    Send-ShortcutIconRefresh $candidate.FullName
    $refreshed++
    Write-Output "Updated: $($candidate.FullName)"
}
Write-Output "Updated $updated shortcut icons."
Write-Output "Refreshed $refreshed Windows shell items."
if ($updated -gt 0) { Write-Output "Backups: $backupRoot" }
