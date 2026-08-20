$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$healthUrl = 'http://127.0.0.1:2037/health'
$appUrl = 'http://127.0.0.1:2037/'

$isRunning = $false
try {
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
    $isRunning = $response.StatusCode -eq 200
} catch {
    $isRunning = $false
}

if (-not $isRunning) {
    Start-Process -FilePath 'node' -ArgumentList 'scripts/serve.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 200
        try {
            $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 1
            if ($response.StatusCode -eq 200) {
                $isRunning = $true
                break
            }
        } catch {
            # The server is still starting.
        }
    }
}

if (-not $isRunning) {
    throw "SUOWANG did not start. Run 'npm start' in $projectRoot to see the server error."
}

Start-Process $appUrl
