$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$healthUrl = 'http://127.0.0.1:2037/health'
$appUrl = 'http://127.0.0.1:2037/'

function Get-SuowangDataDir {
    if ($env:SUOWANG_DATA_DIR) {
        return [System.IO.Path]::GetFullPath($env:SUOWANG_DATA_DIR)
    }
    if (Test-Path -LiteralPath 'D:/5Data') {
        return 'D:/5Data/suowang'
    }
    return (Join-Path $env:LOCALAPPDATA 'SUOWANG')
}
function Show-StartError([string]$message) {
    try {
        Add-Type -AssemblyName PresentationFramework -ErrorAction Stop
        [System.Windows.MessageBox]::Show(
            $message,
            'SUOWANG 启动失败',
            [System.Windows.MessageBoxButton]::OK,
            [System.Windows.MessageBoxImage]::Error
        ) | Out-Null
    } catch {
        Write-Error $message
    }
}

function Test-SuowangHealth {
    try {
        $response = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
        return $response.status -eq 'ok' -and $response.app -eq 'suowang' -and $response.database -eq 'ready'
    } catch {
        return $false
    }
}

try {
    $nodeCommand = Get-Command node -ErrorAction Stop
    $nodeMajor = [int]((& $nodeCommand.Source --version).TrimStart('v').Split('.')[0])
    if ($nodeMajor -lt 22) {
        throw "检测到 Node $nodeMajor。SUOWANG 需要 Node 22 或更高版本。"
    }

    $isRunning = Test-SuowangHealth
    if (-not $isRunning) {
        $dataDir = Get-SuowangDataDir
        $logsDir = Join-Path $dataDir 'logs'
        New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
        $stdoutLog = Join-Path $logsDir 'latest-stdout.log'
        $stderrLog = Join-Path $logsDir 'latest-stderr.log'

        Start-Process `
            -FilePath $nodeCommand.Source `
            -ArgumentList 'scripts/serve.mjs' `
            -WorkingDirectory $projectRoot `
            -WindowStyle Hidden `
            -RedirectStandardOutput $stdoutLog `
            -RedirectStandardError $stderrLog

        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            Start-Sleep -Milliseconds 250
            if (Test-SuowangHealth) {
                $isRunning = $true
                break
            }
        }
    }

    if (-not $isRunning) {
        $dataDir = Get-SuowangDataDir
        $stderrLog = Join-Path $dataDir 'logs/latest-stderr.log'
        $detail = if (Test-Path -LiteralPath $stderrLog) {
            (Get-Content -LiteralPath $stderrLog -Tail 12) -join [Environment]::NewLine
        } else {
            '本地服务没有在预期时间内就绪。'
        }
        throw "阶段：启动本地服务`n原因：$detail`n日志：$stderrLog`n下一步：确认 Node 22+ 已安装，或查看该日志。"
    }

    Start-Process -FilePath $appUrl
} catch {
    Show-StartError $_.Exception.Message
    exit 1
}
