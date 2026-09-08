param([switch]$Register)
$ErrorActionPreference = 'Stop'
& node "$PSScriptRoot/build-icons.mjs"
if ($LASTEXITCODE -ne 0) { throw 'Widget icon conversion failed.' }
$msbuild = Get-ChildItem -LiteralPath 'C:/Program Files (x86)/Microsoft Visual Studio/2022' -Filter MSBuild.exe -Recurse |
    Where-Object FullName -match 'MSBuild[\\/]Current[\\/]Bin[\\/]MSBuild.exe$' | Select-Object -First 1 -ExpandProperty FullName
if (-not $msbuild) { throw 'MSBuild with DesktopBridge is required.' }
& $msbuild "$PSScriptRoot/Package/Package.wapproj" /restore /p:Configuration=Release /p:Platform=x64 /p:AppxBundle=Never /p:AppxPackageSigningEnabled=false /v:minimal /nologo
if ($LASTEXITCODE -ne 0) { throw 'Widget package build failed.' }
$layout = Join-Path $PSScriptRoot 'Package/bin/x64/Release'
New-Item -ItemType Directory -Path "$layout/Public" -Force | Out-Null
Copy-Item -LiteralPath "$PSScriptRoot/Widget/obj/widbar/plugin.json" -Destination "$layout/Public/plugin.json"
if ($Register) { Add-AppxPackage -Register "$layout/AppxManifest.xml" -ErrorAction Stop }
Write-Output "Widget layout: $layout"
