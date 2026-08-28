param(
    [string]$NodeVersion = '24.15.0',
    [string]$Architecture = 'x64'
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$version = $package.version
$distRoot = Join-Path $projectRoot 'dist/windows'
$portableName = "SUOWANG-Portable-$version"
$portableRoot = Join-Path $distRoot $portableName
$cacheRoot = Join-Path $projectRoot '.release-cache'
$nodeArchive = "node-v$NodeVersion-win-$Architecture.zip"
$nodeUrl = "https://nodejs.org/dist/v$NodeVersion/$nodeArchive"
$nodeZip = Join-Path $cacheRoot $nodeArchive

function Assert-ChildPath([string]$parent, [string]$child) {
    $resolvedParent = [System.IO.Path]::GetFullPath($parent).TrimEnd('\') + '\'
    $resolvedChild = [System.IO.Path]::GetFullPath($child)
    if (-not $resolvedChild.StartsWith($resolvedParent, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to modify a path outside $($parent): $child"
    }
}

function Copy-ReleaseItem([string]$relativePath) {
    $source = Join-Path $projectRoot $relativePath
    $destination = Join-Path $portableRoot $relativePath
    if (-not (Test-Path -LiteralPath $source)) {
        throw "Required release item is missing: $relativePath"
    }
    $destinationParent = Split-Path -Parent $destination
    New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
    if (Test-Path -LiteralPath $source -PathType Container) {
        Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
    } else {
        Copy-Item -LiteralPath $source -Destination $destination -Force
    }
}

New-Item -ItemType Directory -Force -Path $distRoot, $cacheRoot | Out-Null
Assert-ChildPath $distRoot $portableRoot
if (Test-Path -LiteralPath $portableRoot) {
    Remove-Item -LiteralPath $portableRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $portableRoot | Out-Null

$releaseItems = @(
    'assets/mainline-scene-bright-office-v1-no-arrows-geometry-v5.png',
    'assets/mainline-scene-bright-office-v1-arrow-restore-light-v2.png',
    'assets/mainline-scene-bright-office-v1-arrow-work-light-v4.png',
    'assets/mainline-scene-bright-office-v1-arrow-life-light-v2.png',
    'index.html',
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
    'WINDOWS-README.txt',
    'SUOWANG.cmd',
    'migrations',
    'scripts/launcher-config.mjs',
    'scripts/start.ps1',
    'scripts/serve.mjs',
    'src/server/launcher-policy.mjs',
    'src',
    'package.json',
    'node_modules/better-sqlite3',
    'node_modules/node-addon-api'
)
foreach ($item in $releaseItems) { Copy-ReleaseItem $item }

if (-not (Test-Path -LiteralPath $nodeZip)) {
    Write-Host "Downloading Node.js v$NodeVersion runtime..."
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip
}

$nodeExtractRoot = Join-Path $cacheRoot "node-v$NodeVersion-win-$Architecture"
if (-not (Test-Path -LiteralPath (Join-Path $nodeExtractRoot 'node.exe'))) {
    Assert-ChildPath $cacheRoot $nodeExtractRoot
    if (Test-Path -LiteralPath $nodeExtractRoot) {
        Remove-Item -LiteralPath $nodeExtractRoot -Recurse -Force
    }
    Expand-Archive -LiteralPath $nodeZip -DestinationPath $cacheRoot -Force
}
Copy-Item -LiteralPath $nodeExtractRoot -Destination (Join-Path $portableRoot 'runtime') -Recurse -Force

& (Join-Path $portableRoot 'runtime/node.exe') --version
Push-Location $portableRoot
try {
    & (Join-Path $portableRoot 'runtime/node.exe') -e "import('better-sqlite3').then(() => console.log('better-sqlite3 runtime OK'))"
} finally {
    Pop-Location
}

$portableZip = Join-Path $distRoot "$portableName.zip"
if (Test-Path -LiteralPath $portableZip) { Remove-Item -LiteralPath $portableZip -Force }
Compress-Archive -LiteralPath $portableRoot -DestinationPath $portableZip -CompressionLevel Optimal

$isccPath = @(
    (Get-Command 'iscc.exe' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
    (Join-Path $env:LOCALAPPDATA 'Programs/Inno Setup 6/ISCC.exe'),
    'C:/Program Files (x86)/Inno Setup 6/ISCC.exe',
    'C:/Program Files/Inno Setup 6/ISCC.exe'
) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
if ($isccPath) {
    & $isccPath "/DAppVersion=$version" (Join-Path $projectRoot 'installer/SUOWANG.iss')
} else {
    Write-Warning 'Portable ZIP is ready. Install Inno Setup 6 to generate the Setup.exe on this machine.'
}

$releaseFiles = @($portableZip)
$setupPath = Join-Path $distRoot "SUOWANG-Setup-$version.exe"
if (Test-Path -LiteralPath $setupPath -PathType Leaf) {
    $releaseFiles += $setupPath
}
$checksumsPath = Join-Path $distRoot "SUOWANG-$version-SHA256SUMS.txt"
$checksums = $releaseFiles | ForEach-Object {
    $hash = Get-FileHash -LiteralPath $_ -Algorithm SHA256
    "{0} *{1}" -f $hash.Hash, [System.IO.Path]::GetFileName($_)
}
Set-Content -LiteralPath $checksumsPath -Value $checksums -Encoding ascii

Write-Host "Portable package: $portableZip"
