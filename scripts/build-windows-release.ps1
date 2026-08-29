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
$portableName = "SUOWANG-Portable-$version"
$portableRoot = Join-Path $distRoot $portableName
$forgeOutRoot = Join-Path $projectRoot 'out'
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

New-Item -ItemType Directory -Force -Path $distRoot | Out-Null
Assert-ChildPath $distRoot $portableRoot
if (Test-Path -LiteralPath $forgeOutRoot -PathType Container) {
    $staleForgeRoots = @(Get-ChildItem -LiteralPath $forgeOutRoot -Directory | Where-Object {
        $_.Name.EndsWith("-win32-$Architecture", [System.StringComparison]::OrdinalIgnoreCase)
    })
    foreach ($target in $staleForgeRoots) {
        Assert-ChildPath $forgeOutRoot $target.FullName
        Remove-Item -LiteralPath $target.FullName -Recurse -Force
    }
}
if (Test-Path -LiteralPath $portableRoot) {
    Remove-Item -LiteralPath $portableRoot -Recurse -Force
}

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
$forgeRoot = $forgeRoots[0].FullName
Assert-ChildPath $forgeOutRoot $forgeRoot
Copy-Item -LiteralPath $forgeRoot -Destination $portableRoot -Recurse -Force

$portableZip = Join-Path $distRoot "$portableName.zip"
if (Test-Path -LiteralPath $portableZip) { Remove-Item -LiteralPath $portableZip -Force }
Compress-Archive -LiteralPath $portableRoot -DestinationPath $portableZip -CompressionLevel Optimal

$isccPath = @(
    (Get-Command 'iscc.exe' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
    (Join-Path $env:LOCALAPPDATA 'Programs/Inno Setup 6/ISCC.exe'),
    'C:/Program Files (x86)/Inno Setup 6/ISCC.exe',
    'C:/Program Files/Inno Setup 6/ISCC.exe'
) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
if (-not $isccPath) { throw 'Inno Setup 6 is required to build the Windows Setup.exe.' }

& $isccPath "/DAppVersion=$version" (Join-Path $projectRoot 'installer/SUOWANG.iss')
if ($LASTEXITCODE -ne 0) { throw 'Inno Setup build failed.' }
$setupPath = Join-Path $distRoot "SUOWANG-Setup-$version.exe"
if (-not (Test-Path -LiteralPath $setupPath -PathType Leaf)) { throw "Missing Setup.exe: $setupPath" }

$signingStatus = 'UNSIGNED'
if ($signingRequested) {
    $signTool = Get-Command 'signtool.exe' -ErrorAction Stop | Select-Object -ExpandProperty Source
    $timestampServer = if ($env:WINDOWS_TIMESTAMP_SERVER) { $env:WINDOWS_TIMESTAMP_SERVER } else { 'http://timestamp.digicert.com' }
    $signArguments = @('sign', '/fd', 'SHA256', '/tr', $timestampServer, '/td', 'SHA256', '/f', $env:WINDOWS_CERTIFICATE_FILE)
    if (-not [string]::IsNullOrEmpty($env:WINDOWS_CERTIFICATE_PASSWORD)) { $signArguments += @('/p', $env:WINDOWS_CERTIFICATE_PASSWORD) }
    $signArguments += $setupPath
    & $signTool @signArguments
    if ($LASTEXITCODE -ne 0) { throw 'Setup signing failed.' }
    $signedFiles = @(Get-ChildItem -LiteralPath $portableRoot -Recurse -File | Where-Object { $_.Extension -in @('.exe', '.dll', '.node') }) + @(Get-Item -LiteralPath $setupPath)
    foreach ($file in $signedFiles) {
        & $signTool verify /pa /all $file.FullName
        if ($LASTEXITCODE -ne 0) { throw "Signature verification failed: $($file.FullName)" }
    }
    $signingStatus = 'SIGNED'
}

$releaseFiles = @($portableZip, $setupPath)
$checksumsPath = Join-Path $distRoot "SUOWANG-$version-SHA256SUMS.txt"
$checksums = $releaseFiles | ForEach-Object {
    "{0} *{1}" -f (Get-Sha256Hex $_), [System.IO.Path]::GetFileName($_)
}
Set-Content -LiteralPath $checksumsPath -Value $checksums -Encoding ascii
Set-Content -LiteralPath (Join-Path $distRoot 'SIGNING-STATUS.txt') -Value $signingStatus -Encoding ascii
Write-Host "Windows portable: $portableZip"
Write-Host "Windows setup: $setupPath"
Write-Host "Signing status: $signingStatus"
