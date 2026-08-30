param(
    [string]$Architecture = 'x64',
    [switch]$UseBundledNapiPrebuild
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$repositoryRoot = (git rev-parse --show-toplevel).Trim()
if ([System.IO.Path]::GetFullPath($repositoryRoot) -ne [System.IO.Path]::GetFullPath($projectRoot)) {
    throw "Unexpected repository root: $repositoryRoot"
}

$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$version = $package.version
$distRoot = Join-Path $projectRoot 'dist/windows'
$forgeOutRoot = Join-Path $projectRoot 'out'
$desktopPortableName = "SUOWANG-Desktop-Portable-$version"
$desktopPortableRoot = Join-Path $distRoot $desktopPortableName
$litePortableName = "SUOWANG-Lite-Portable-$version"
$litePortableRoot = Join-Path $distRoot $litePortableName
$desktopPortableZip = Join-Path $distRoot "$desktopPortableName.zip"
$litePortableZip = Join-Path $distRoot "$litePortableName.zip"
$desktopSetupPath = Join-Path $distRoot "SUOWANG-Desktop-Setup-$version.exe"
$liteSetupPath = Join-Path $distRoot "SUOWANG-Lite-Setup-$version.exe"
$checksumsPath = Join-Path $distRoot "SUOWANG-$version-Windows-SHA256SUMS.txt"
$signingRequested = -not [string]::IsNullOrWhiteSpace($env:WINDOWS_CERTIFICATE_FILE)
$env:SUOWANG_SIGNING_STATUS = if ($signingRequested) { 'SIGNED' } else { 'UNSIGNED' }
$env:SUOWANG_FORCE_NATIVE_REBUILD = if ($UseBundledNapiPrebuild) { '0' } else { '1' }

function Assert-ChildPath([string]$parent, [string]$child) {
    $resolvedParent = [System.IO.Path]::GetFullPath($parent).TrimEnd('\') + '\'
    $resolvedChild = [System.IO.Path]::GetFullPath($child)
    if (-not $resolvedChild.StartsWith($resolvedParent, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to modify a path outside $($parent): $child"
    }
}

function Get-Sha256Hex([string]$Path) {
    $stream = [System.IO.File]::OpenRead($Path)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = $sha256.ComputeHash($stream)
        return -join ($bytes | ForEach-Object { $_.ToString('x2') })
    }
    finally {
        $sha256.Dispose()
        $stream.Dispose()
    }
}

function Copy-ReleaseItem([string]$relativePath, [string]$destinationRoot) {
    $source = Join-Path $projectRoot $relativePath
    if (-not (Test-Path -LiteralPath $source)) { throw "Missing Lite release input: $source" }
    $destination = Join-Path $destinationRoot $relativePath
    $parent = Split-Path -Parent $destination
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
}

function Find-Iscc {
    return @(
        (Get-Command 'iscc.exe' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
        (Join-Path $env:LOCALAPPDATA 'Programs/Inno Setup 6/ISCC.exe'),
        'C:/Program Files (x86)/Inno Setup 6/ISCC.exe',
        'C:/Program Files/Inno Setup 6/ISCC.exe'
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
}

New-Item -ItemType Directory -Force -Path $distRoot | Out-Null
foreach ($target in @(
    $desktopPortableRoot,
    $litePortableRoot,
    $desktopPortableZip,
    $litePortableZip,
    $desktopSetupPath,
    $liteSetupPath,
    $checksumsPath
)) {
    Assert-ChildPath $distRoot $target
    if (Test-Path -LiteralPath $target) {
        Remove-Item -LiteralPath $target -Recurse -Force
    }
}

if (Test-Path -LiteralPath $forgeOutRoot -PathType Container) {
    $staleForgeRoots = @(Get-ChildItem -LiteralPath $forgeOutRoot -Directory | Where-Object {
        $_.Name.EndsWith("-win32-$Architecture", [System.StringComparison]::OrdinalIgnoreCase)
    })
    foreach ($target in $staleForgeRoots) {
        Assert-ChildPath $forgeOutRoot $target.FullName
        Remove-Item -LiteralPath $target.FullName -Recurse -Force
    }
}

# Desktop edition: retain the audited Electron shell and its isolated native window.
npm run desktop:prepare
if ($LASTEXITCODE -ne 0) { throw 'Desktop preparation failed.' }
npx electron-forge package --platform=win32 --arch=$Architecture
if ($LASTEXITCODE -ne 0) { throw 'Electron Forge package failed.' }
node scripts/verify-desktop-package.mjs
if ($LASTEXITCODE -ne 0) { throw 'Packaged desktop verification failed.' }

$forgeRoots = @(Get-ChildItem -LiteralPath $forgeOutRoot -Directory | Where-Object {
    $_.Name.EndsWith("-win32-$Architecture", [System.StringComparison]::OrdinalIgnoreCase) -and
        (Test-Path -LiteralPath (Join-Path $_.FullName 'SUOWANG.exe') -PathType Leaf)
})
if ($forgeRoots.Count -ne 1) {
    throw "Expected exactly one Forge package ending in -win32-$Architecture with SUOWANG.exe; found $($forgeRoots.Count)."
}
Copy-Item -LiteralPath $forgeRoots[0].FullName -Destination $desktopPortableRoot -Recurse -Force

# Lite edition: ship only the local web app, SQLite native dependency, official Node runtime and a no-console launcher.
$liteItems = @(
    'assets/mainline-scene-bright-office-v1-no-arrows-geometry-v5.png',
    'assets/mainline-scene-bright-office-v1-arrow-restore-light-v2.png',
    'assets/mainline-scene-bright-office-v1-arrow-work-light-v4.png',
    'assets/mainline-scene-bright-office-v1-arrow-life-light-v2.png',
    'assets/brand',
    'index.html',
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
    'WINDOWS-README.txt',
    'migrations',
    'package.json',
    'scripts/launcher-config.mjs',
    'scripts/serve.mjs',
    'scripts/start.ps1',
    'src',
    'node_modules/better-sqlite3',
    'node_modules/node-addon-api'
)
New-Item -ItemType Directory -Force -Path $litePortableRoot | Out-Null
foreach ($item in $liteItems) { Copy-ReleaseItem $item $litePortableRoot }

$nodeVersion = '24.15.0'
$nodeArchiveName = "node-v$nodeVersion-win-x64.zip"
$cacheRoot = Join-Path $projectRoot '.release-cache'
$nodeArchivePath = Join-Path $cacheRoot $nodeArchiveName
$nodeShasumsPath = Join-Path $cacheRoot "node-v$nodeVersion-SHASUMS256.txt"
$nodeExtractedRoot = Join-Path $cacheRoot "node-v$nodeVersion-win-x64"
New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null
if (-not (Test-Path -LiteralPath $nodeArchivePath -PathType Leaf)) {
    Invoke-WebRequest -Uri "https://nodejs.org/dist/v$nodeVersion/$nodeArchiveName" -OutFile $nodeArchivePath
}
if (-not (Test-Path -LiteralPath $nodeShasumsPath -PathType Leaf)) {
    Invoke-WebRequest -Uri "https://nodejs.org/dist/v$nodeVersion/SHASUMS256.txt" -OutFile $nodeShasumsPath
}
node scripts/verify-node-download.mjs $nodeShasumsPath $nodeArchivePath $nodeArchiveName
if ($LASTEXITCODE -ne 0) { throw 'Bundled Node archive verification failed.' }
if (-not (Test-Path -LiteralPath (Join-Path $nodeExtractedRoot 'node.exe') -PathType Leaf)) {
    if (Test-Path -LiteralPath $nodeExtractedRoot) { Remove-Item -LiteralPath $nodeExtractedRoot -Recurse -Force }
    Expand-Archive -LiteralPath $nodeArchivePath -DestinationPath $cacheRoot -Force
}
$runtimeRoot = Join-Path $litePortableRoot 'runtime'
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $nodeExtractedRoot 'node.exe') -Destination (Join-Path $runtimeRoot 'node.exe') -Force
Copy-Item -LiteralPath (Join-Path $nodeExtractedRoot 'LICENSE') -Destination (Join-Path $runtimeRoot 'NODE-LICENSE.txt') -Force

$cscPath = @(
    'C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',
    'C:/Windows/Microsoft.NET/Framework/v4.0.30319/csc.exe'
) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $cscPath) { throw 'The Windows .NET Framework C# compiler is required to build the Lite launcher.' }
$liteLauncherPath = Join-Path $litePortableRoot 'SUOWANG-Lite.exe'
& $cscPath /nologo /target:winexe /platform:x64 /codepage:65001 /reference:System.Windows.Forms.dll "/win32icon:$projectRoot/assets/brand/suowang-app-icon.ico" "/out:$liteLauncherPath" (Join-Path $projectRoot 'windows-lite/SUOWANGLiteLauncher.cs')
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $liteLauncherPath -PathType Leaf)) {
    throw 'Lite native launcher compilation failed.'
}

Push-Location -LiteralPath $litePortableRoot
try {
    & (Join-Path $runtimeRoot 'node.exe') -e "require('./node_modules/better-sqlite3'); console.log(process.versions.node)"
    if ($LASTEXITCODE -ne 0) { throw 'Lite bundled Node could not load better-sqlite3.' }
}
finally {
    Pop-Location
}

$signingStatus = 'UNSIGNED'
$signTool = $null
if ($signingRequested) {
    $signTool = Get-Command 'signtool.exe' -ErrorAction Stop | Select-Object -ExpandProperty Source
    $timestampServer = if ($env:WINDOWS_TIMESTAMP_SERVER) { $env:WINDOWS_TIMESTAMP_SERVER } else { 'http://timestamp.digicert.com' }
    $signArguments = @('sign', '/fd', 'SHA256', '/tr', $timestampServer, '/td', 'SHA256', '/f', $env:WINDOWS_CERTIFICATE_FILE)
    if (-not [string]::IsNullOrEmpty($env:WINDOWS_CERTIFICATE_PASSWORD)) { $signArguments += @('/p', $env:WINDOWS_CERTIFICATE_PASSWORD) }
    $portableBinaries = @(
        Get-ChildItem -LiteralPath $desktopPortableRoot -Recurse -File | Where-Object { $_.Extension -in @('.exe', '.dll', '.node') }
        Get-ChildItem -LiteralPath $litePortableRoot -Recurse -File | Where-Object { $_.Extension -in @('.exe', '.dll', '.node') }
    )
    foreach ($file in $portableBinaries) {
        & $signTool @signArguments $file.FullName
        if ($LASTEXITCODE -ne 0) { throw "Signing failed: $($file.FullName)" }
    }
    $signingStatus = 'SIGNED'
}

Compress-Archive -LiteralPath $desktopPortableRoot -DestinationPath $desktopPortableZip -CompressionLevel Optimal
Compress-Archive -LiteralPath $litePortableRoot -DestinationPath $litePortableZip -CompressionLevel Optimal

$isccPath = Find-Iscc
if (-not $isccPath) { throw 'Inno Setup 6 is required to build the Windows Setup.exe files.' }
& $isccPath "/DAppVersion=$version" (Join-Path $projectRoot 'installer/SUOWANG.iss')
if ($LASTEXITCODE -ne 0) { throw 'Desktop Inno Setup build failed.' }
& $isccPath "/DAppVersion=$version" (Join-Path $projectRoot 'installer/SUOWANG-Lite.iss')
if ($LASTEXITCODE -ne 0) { throw 'Lite Inno Setup build failed.' }
foreach ($setupPath in @($desktopSetupPath, $liteSetupPath)) {
    if (-not (Test-Path -LiteralPath $setupPath -PathType Leaf)) { throw "Missing Setup.exe: $setupPath" }
}

if ($signingRequested) {
    $timestampServer = if ($env:WINDOWS_TIMESTAMP_SERVER) { $env:WINDOWS_TIMESTAMP_SERVER } else { 'http://timestamp.digicert.com' }
    $signArguments = @('sign', '/fd', 'SHA256', '/tr', $timestampServer, '/td', 'SHA256', '/f', $env:WINDOWS_CERTIFICATE_FILE)
    if (-not [string]::IsNullOrEmpty($env:WINDOWS_CERTIFICATE_PASSWORD)) { $signArguments += @('/p', $env:WINDOWS_CERTIFICATE_PASSWORD) }
    foreach ($setupPath in @($desktopSetupPath, $liteSetupPath)) {
        & $signTool @signArguments $setupPath
        if ($LASTEXITCODE -ne 0) { throw "Setup signing failed: $setupPath" }
    }
    $signedFiles = @(
        Get-ChildItem -LiteralPath $desktopPortableRoot -Recurse -File | Where-Object { $_.Extension -in @('.exe', '.dll', '.node') }
        Get-ChildItem -LiteralPath $litePortableRoot -Recurse -File | Where-Object { $_.Extension -in @('.exe', '.dll', '.node') }
        Get-Item -LiteralPath $desktopSetupPath
        Get-Item -LiteralPath $liteSetupPath
    )
    foreach ($file in $signedFiles) {
        & $signTool verify /pa /all $file.FullName
        if ($LASTEXITCODE -ne 0) { throw "Signature verification failed: $($file.FullName)" }
    }
}

$releaseFiles = @($liteSetupPath, $litePortableZip, $desktopSetupPath, $desktopPortableZip)
$checksums = $releaseFiles | ForEach-Object {
    "{0} *{1}" -f (Get-Sha256Hex $_), [System.IO.Path]::GetFileName($_)
}
Set-Content -LiteralPath $checksumsPath -Value $checksums -Encoding ascii
Set-Content -LiteralPath (Join-Path $distRoot 'SIGNING-STATUS.txt') -Value $signingStatus -Encoding ascii

Write-Host "Windows Lite setup: $liteSetupPath"
Write-Host "Windows Lite portable: $litePortableZip"
Write-Host "Windows Desktop setup: $desktopSetupPath"
Write-Host "Windows Desktop portable: $desktopPortableZip"
Write-Host "Windows checksums: $checksumsPath"
Write-Host "Signing status: $signingStatus"
