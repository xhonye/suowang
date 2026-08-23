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

function Get-SuowangAccessMode {
    if ($env:SUOWANG_ACCESS) {
        return $env:SUOWANG_ACCESS
    }
    $accessConfigPath = Join-Path (Get-SuowangDataDir) 'access.json'
    if (Test-Path -LiteralPath $accessConfigPath) {
        try {
            $mode = (Get-Content -LiteralPath $accessConfigPath -Raw | ConvertFrom-Json).accessMode
            if ($mode -in @('local', 'tailscale')) { return $mode }
        } catch {
            throw "手机访问配置无效：$accessConfigPath"
        }
    }
    return 'local'
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

function Get-TailscaleIp {
    $tailscale = Join-Path $env:ProgramFiles 'Tailscale/tailscale.exe'
    if (-not (Test-Path -LiteralPath $tailscale)) {
        return $null
    }
    $addresses = @(@(& $tailscale ip -4 2>$null) | Where-Object { $_ -match '^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.' })
    if ($addresses.Count -eq 1) { return $addresses[0] }
    return $null
}

function Test-SuowangHealth([string]$url) {
    try {
        $response = Invoke-RestMethod -Uri $url -TimeoutSec 2
        return $response.status -eq 'ok' -and $response.app -eq 'suowang' -and $response.database -eq 'ready'
    } catch {
        return $false
    }
}

function Test-SuowangTailscaleListener([string]$tailscaleIp) {
    if (-not $tailscaleIp) { return $false }
    $localListener = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 2037 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    $remoteListener = Get-NetTCPConnection -LocalAddress $tailscaleIp -LocalPort 2037 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    return $localListener -and $remoteListener -and $localListener.OwningProcess -eq $remoteListener.OwningProcess
}

function Stop-VerifiedSuowangServer {
    $listener = Get-NetTCPConnection -LocalPort 2037 -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalAddress -eq '127.0.0.1' } |
        Select-Object -First 1
    if (-not $listener) {
        throw '检测到访问模式需要切换，但没有找到 SUOWANG 本地监听进程。'
    }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if (-not $process -or $process.Name -ne 'node.exe' -or $process.CommandLine -notmatch 'scripts[/\\]serve\.mjs') {
        throw '2037 端口上的进程无法确认为 SUOWANG，已停止自动切换以保护其他程序。'
    }
    Stop-Process -Id $listener.OwningProcess -Force
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 100
        if (-not (Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue)) { return }
    }
    throw '旧的 SUOWANG 服务未能正常停止，请重启电脑后再试。'
}

try {
    $accessMode = Get-SuowangAccessMode
    $nodeCommand = Get-Command node -ErrorAction Stop
    $nodeMajor = [int]((& $nodeCommand.Source --version).TrimStart('v').Split('.')[0])
    if ($nodeMajor -lt 22) {
        throw "检测到 Node $nodeMajor。SUOWANG 需要 Node 22 或更高版本。"
    }

    $tailscaleIp = Get-TailscaleIp
    if ($accessMode -eq 'tailscale' -and -not $tailscaleIp) {
        throw '已启用手机访问模式，但 Tailscale 当前没有连接。请先连接 Tailscale，或运行 suowang access local。'
    }
    $localRunning = Test-SuowangHealth $healthUrl
    $remoteRunning = Test-SuowangTailscaleListener $tailscaleIp
    $isRunning = if ($accessMode -eq 'tailscale') {
        $localRunning -and $remoteRunning
    } else {
        $localRunning -and -not $remoteRunning
    }

    if (-not $isRunning -and ($localRunning -or $remoteRunning)) {
        Stop-VerifiedSuowangServer
        $localRunning = $false
        $remoteRunning = $false
    }

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
            $localRunning = Test-SuowangHealth $healthUrl
            $remoteRunning = Test-SuowangTailscaleListener $tailscaleIp
            if ($localRunning -and ($accessMode -ne 'tailscale' -or $remoteRunning)) {
                $isRunning = $true
                break
            }
        }
    }

    if (-not $isRunning) {
        $dataDir = Get-SuowangDataDir
        $stderrLog = Join-Path $dataDir 'logs/latest-stderr.log'
        $stderrDetail = if (Test-Path -LiteralPath $stderrLog) {
            ((Get-Content -LiteralPath $stderrLog -Tail 12) -join [Environment]::NewLine).Trim()
        } else { '' }
        $stdoutLog = Join-Path $dataDir 'logs/latest-stdout.log'
        $stdoutDetail = if (Test-Path -LiteralPath $stdoutLog) {
            ((Get-Content -LiteralPath $stdoutLog -Tail 12) -join [Environment]::NewLine).Trim()
        } else { '' }
        $detail = if ($stderrDetail) {
            $stderrDetail
        } elseif ($stdoutDetail) {
            "服务输出：$stdoutDetail"
        } else {
            '本地服务没有在预期时间内就绪，且没有产生启动日志。'
        }
        throw "阶段：启动本地服务`n原因：$detail`n日志：$stderrLog`n下一步：确认 Node 22+ 已安装，或查看该日志。"
    }

    Start-Process -FilePath $appUrl
} catch {
    Show-StartError $_.Exception.Message
    exit 1
}
