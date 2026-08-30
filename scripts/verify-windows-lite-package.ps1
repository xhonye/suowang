param(
    [string]$Version,
    [string]$DistRoot,
    [switch]$VerifyShortcut
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $Version) {
    $Version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
}
if (-not $DistRoot) { $DistRoot = Join-Path $projectRoot 'dist/windows' }
$portableRoot = Join-Path $DistRoot "SUOWANG-Lite-Portable-$Version"
$portableExe = Join-Path $portableRoot 'SUOWANG-Lite.exe'
$setupPath = Join-Path $DistRoot "SUOWANG-Lite-Setup-$Version.exe"
$liteServicePids = @()
foreach ($path in @($portableExe, $setupPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing Lite candidate: $path" }
}

function Get-FreePort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try { return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port }
    finally { $listener.Stop() }
}

function Get-PeSubsystem([string]$path) {
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $peOffset = [System.BitConverter]::ToInt32($bytes, 0x3c)
    return [System.BitConverter]::ToUInt16($bytes, $peOffset + 24 + 68)
}

function Invoke-LiteSmoke([string]$entry, [string]$dataDir, [string]$name) {
    $port = Get-FreePort
    $healthUrl = "http://127.0.0.1:$port/health"
    $env:SUOWANG_DATA_DIR = $dataDir
    $env:SUOWANG_PORT = [string]$port
    $env:SUOWANG_ACCESS = 'local'
    $env:SUOWANG_SKIP_BROWSER = '1'
    $process = Start-Process -FilePath $entry -PassThru
    $visibleShells = @()
    while (-not $process.HasExited) {
        $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($process.Id)" -ErrorAction SilentlyContinue)
        foreach ($child in $children | Where-Object { $_.Name -match '^(powershell|pwsh|cmd)\.exe$' }) {
            $shellProcess = Get-Process -Id $child.ProcessId -ErrorAction SilentlyContinue
            if ($shellProcess -and $shellProcess.MainWindowHandle -ne 0) { $visibleShells += $child.ProcessId }
        }
        Start-Sleep -Milliseconds 100
        $process.Refresh()
    }
    if ($process.ExitCode -ne 0) {
        $failureLog = Join-Path $dataDir 'logs/latest-launcher-error.log'
        $detail = if (Test-Path -LiteralPath $failureLog -PathType Leaf) {
            ((Get-Content -LiteralPath $failureLog -Tail 20) -join [Environment]::NewLine).Trim()
        } else {
            'No launcher diagnostic log was created.'
        }
        throw "$name launcher exited with $($process.ExitCode). $detail"
    }
    if ($visibleShells.Count -gt 0) { throw "$name exposed a PowerShell child window." }

    $health = $null
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
        try { $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2; break }
        catch { Start-Sleep -Milliseconds 100 }
    }
    if (-not $health) { throw "$name service did not become healthy." }
    if ($health.version -ne $Version -or $health.app -ne 'suowang' -or $health.accessMode -ne 'local') {
        throw "$name returned an invalid health identity."
    }
    $script:liteServicePids += [int]$health.pid
    foreach ($asset in @(
        'assets/mainline-scene-bright-office-v1-no-arrows-geometry-v5.png',
        'assets/mainline-scene-bright-office-v1-arrow-restore-light-v2.png',
        'assets/mainline-scene-bright-office-v1-arrow-work-light-v4.png',
        'assets/mainline-scene-bright-office-v1-arrow-life-light-v2.png'
    )) {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/$asset" -TimeoutSec 3
        if ($response.StatusCode -ne 200 -or $response.RawContentLength -lt 1024) { throw "$name could not load $asset." }
    }
    if (-not (Test-Path -LiteralPath (Join-Path $dataDir 'suowang.db') -PathType Leaf)) {
        throw "$name did not create its SQLite database."
    }

    $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($health.pid)" -ErrorAction Stop
    if ($owner.Name -ine 'node.exe' -or $owner.CommandLine -notmatch 'scripts[/\\]serve\.mjs') {
        throw "$name health PID was not the bundled SUOWANG service."
    }
    Stop-Process -Id $health.pid
    for ($attempt = 0; $attempt -lt 50 -and (Get-Process -Id $health.pid -ErrorAction SilentlyContinue); $attempt++) {
        Start-Sleep -Milliseconds 100
    }
    if (Get-Process -Id $health.pid -ErrorAction SilentlyContinue) { throw "$name service did not stop." }

    return [pscustomobject]@{
        Entry = $name
        Version = $health.version
        VisibleShells = $visibleShells.Count
        VisualAssets = 4
        Database = 'ready'
    }
}

$testRoot = Join-Path $env:TEMP "suowang-lite-verify-$([guid]::NewGuid().ToString('N'))"
$installRoot = Join-Path $testRoot 'installed'
$portableData = Join-Path $testRoot 'portable-data'
$installedData = Join-Path $testRoot 'installed-data'
$shortcutData = Join-Path $testRoot 'shortcut-data'
$upgradeData = Join-Path $testRoot 'upgrade-data'
New-Item -ItemType Directory -Force -Path $testRoot | Out-Null

try {
    if ((Get-PeSubsystem $portableExe) -ne 2) { throw 'Lite launcher is not a Windows GUI executable.' }
    $portableResult = Invoke-LiteSmoke $portableExe $portableData 'portable'

    $setupArguments = @(
        '/VERYSILENT',
        '/SUPPRESSMSGBOXES',
        '/NORESTART',
        "/DIR=$installRoot"
    )
    if (-not $VerifyShortcut) { $setupArguments += '/NOICONS' }
    $setupProcess = Start-Process -FilePath $setupPath -ArgumentList $setupArguments -Wait -PassThru -WindowStyle Hidden
    if ($setupProcess.ExitCode -ne 0) { throw "Lite Setup exited with $($setupProcess.ExitCode)." }
    $installedExe = Join-Path $installRoot 'SUOWANG-Lite.exe'
    $uninstaller = Join-Path $installRoot 'unins000.exe'
    foreach ($path in @($installedExe, $uninstaller)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Lite installed file missing: $path" }
    }
    if ((Get-PeSubsystem $installedExe) -ne 2) { throw 'Installed Lite launcher is not a Windows GUI executable.' }
    $installedResult = Invoke-LiteSmoke $installedExe $installedData 'installed'

    $shortcutResult = $null
    if ($VerifyShortcut) {
        $shortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) '所往 SUOWANG（轻量版）.lnk'
        if (-not (Test-Path -LiteralPath $shortcutPath -PathType Leaf)) { throw 'Lite desktop shortcut was not created.' }
        $shortcutResult = Invoke-LiteSmoke $shortcutPath $shortcutData 'desktop-shortcut'
    }

    & node (Join-Path $projectRoot 'scripts/create-upgrade-fixture.mjs') $upgradeData
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the controlled Lite upgrade fixture.' }
    $upgradeResult = Invoke-LiteSmoke $installedExe $upgradeData 'installed-upgrade'
    & node (Join-Path $projectRoot 'scripts/verify-upgrade-fixture.mjs') $upgradeData
    if ($LASTEXITCODE -ne 0) { throw 'Lite upgrade fixture verification failed.' }

    $uninstallProcess = Start-Process -FilePath $uninstaller -ArgumentList @(
        '/VERYSILENT',
        '/SUPPRESSMSGBOXES',
        '/NORESTART'
    ) -Wait -PassThru -WindowStyle Hidden
    if ($uninstallProcess.ExitCode -ne 0) { throw "Lite uninstaller exited with $($uninstallProcess.ExitCode)." }
    if (-not (Test-Path -LiteralPath (Join-Path $upgradeData 'suowang.db') -PathType Leaf)) {
        throw 'Lite user database did not survive uninstall.'
    }
    & node (Join-Path $projectRoot 'scripts/verify-upgrade-fixture.mjs') $upgradeData
    if ($LASTEXITCODE -ne 0) { throw 'Lite upgraded data changed after uninstall.' }

    $portableResult
    $installedResult
    if ($shortcutResult) { $shortcutResult }
    $upgradeResult
    [pscustomobject]@{ Entry = 'uninstall'; DatabasePreserved = $true; InstallRemoved = -not (Test-Path -LiteralPath $installedExe) }
}
finally {
    foreach ($processId in $liteServicePids) {
        $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
        if ($owner -and $owner.Name -ieq 'node.exe' -and $owner.CommandLine -match 'scripts[/\\]serve\.mjs') {
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
    }
    Remove-Item Env:SUOWANG_DATA_DIR -ErrorAction SilentlyContinue
    Remove-Item Env:SUOWANG_PORT -ErrorAction SilentlyContinue
    Remove-Item Env:SUOWANG_ACCESS -ErrorAction SilentlyContinue
    Remove-Item Env:SUOWANG_SKIP_BROWSER -ErrorAction SilentlyContinue
    $resolvedTestRoot = [System.IO.Path]::GetFullPath($testRoot)
    $resolvedTempRoot = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
    if ($resolvedTestRoot.StartsWith($resolvedTempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
