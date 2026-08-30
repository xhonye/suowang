param([Parameter(Mandatory = $true)][string]$DataRoot)
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot '../scripts/start.ps1'
$ast = [System.Management.Automation.Language.Parser]::ParseFile($source, [ref]$null, [ref]$null)
foreach ($name in @('Get-VerifiedSuowangProcess', 'Get-ListenerState')) {
    $definition = $ast.Find({ param($entry) $entry -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $entry.Name -eq $name }, $true)
    . ([scriptblock]::Create($definition.Extent.Text))
}
$projectRoot = 'C:\Fixture App\SUOWANG'
$dataDir = $DataRoot
$nodePath = Join-Path $projectRoot 'runtime/node.exe'
$script:fixtureProcess = [pscustomobject]@{
    Name = 'node.exe'; ExecutablePath = $nodePath; CreationDate = 'fixture-start'
    CommandLine = '"' + $nodePath + '" "' + (Join-Path $projectRoot 'scripts/serve.mjs') + '"'
}
function Get-CimInstance { return $script:fixtureProcess }
function Get-NetTCPConnection { return $script:fixtureListeners }
$health = [pscustomobject]@{ pid = 1234 }
$listener = @{ LocalListener = [pscustomobject]@{ OwningProcess = 1234 } }
$lockPath = Join-Path $dataDir 'instance.lock'
function Write-FixtureLock($lockPid = 1234, $kind = 'cli-local', $token = 'fixture-token') {
    @{ pid = $lockPid; kind = $kind; token = $token } | ConvertTo-Json | Set-Content -LiteralPath $lockPath -Encoding UTF8
}
function Assert-Identity([bool]$expected, [string]$label) {
    $actual = Get-VerifiedSuowangProcess $health $listener
    if ($actual.Verified -ne $expected) { throw "Identity case failed: $label" }
}
Assert-Identity $false 'missing data-directory lock'
Write-FixtureLock
Assert-Identity $true 'exact install, lock and listener'
Write-FixtureLock 5678
Assert-Identity $false 'different data directory owner'
Write-FixtureLock 1234 'electron-desktop'
Assert-Identity $false 'different shell'
Write-FixtureLock 1234 'cli-local' ''
Assert-Identity $false 'missing ownership token'
Write-FixtureLock
$script:fixtureProcess.ExecutablePath = 'C:\Other App\node.exe'
Assert-Identity $false 'unrelated Node runtime'
$script:fixtureProcess.ExecutablePath = $nodePath
$script:fixtureProcess.CommandLine = 'node.exe scripts/serve.mjs.evil'
Assert-Identity $false 'script suffix collision'
$script:fixtureProcess.CommandLine = 'node.exe --eval scripts/serve.mjs'
Assert-Identity $false 'eval is not the server entry point'
$script:fixtureProcess.CommandLine = '"' + $nodePath + '" scripts/serve.mjs'
Assert-Identity $true 'legacy relative server with verified lock'
$health.pid = 5678
Assert-Identity $false 'health disagrees with listener'
$script:fixtureListeners = @([pscustomobject]@{ LocalAddress = '127.0.0.1'; OwningProcess = 1234 })
if (-not (Get-ListenerState 2037 'local' $null).AccessModeMatches) { throw 'Exact loopback rejected' }
$script:fixtureListeners += [pscustomobject]@{ LocalAddress = '0.0.0.0'; OwningProcess = 1234 }
if ((Get-ListenerState 2037 'local' $null).AccessModeMatches) { throw 'Wildcard listener accepted as local-only' }
Write-Output 'launcher identity: 12 cases passed'
