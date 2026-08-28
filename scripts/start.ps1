$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot

function Get-SuowangLauncherConfig([string]$nodePath) {
    $configJson = & $nodePath (Join-Path $projectRoot 'scripts/launcher-config.mjs')
    if ($LASTEXITCODE -ne 0 -or -not $configJson) {
        throw '无法读取统一启动配置。请检查数据目录环境变量和安装文件。'
    }
    return ($configJson | ConvertFrom-Json)
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

function Test-SuowangTailscaleListener([string]$tailscaleIp, [int]$port) {
    if (-not $tailscaleIp) { return $false }
    $localListener = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    $remoteListener = Get-NetTCPConnection -LocalAddress $tailscaleIp -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    return $localListener -and $remoteListener -and $localListener.OwningProcess -eq $remoteListener.OwningProcess
}

function Stop-VerifiedSuowangServer([int]$port) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalAddress -eq '127.0.0.1' } |
        Select-Object -First 1
    if (-not $listener) {
        throw '检测到访问模式需要切换，但没有找到 SUOWANG 本地监听进程。'
    }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if (-not $process -or $process.Name -ne 'node.exe' -or $process.CommandLine -notmatch 'scripts[/\\]serve\.mjs') {
        throw "$port 端口上的进程无法确认为 SUOWANG，已停止自动切换以保护其他程序。"
    }
    Stop-Process -Id $listener.OwningProcess -Force
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 100
        if (-not (Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue)) { return }
    }
    throw '旧的 SUOWANG 服务未能正常停止，请重启电脑后再试。'
}

try {
    $bundledNode = Join-Path $projectRoot 'runtime/node.exe'
    $nodePath = if (Test-Path -LiteralPath $bundledNode -PathType Leaf) {
        $bundledNode
    } else {
        (Get-Command node -ErrorAction Stop).Source
    }
    $nodeMajor = [int]((& $nodePath --version).TrimStart('v').Split('.')[0])
    if ($nodeMajor -lt 22) {
        throw "检测到 Node $nodeMajor。SUOWANG 需要 Node 22 或更高版本。"
    }
    $launcherConfig = Get-SuowangLauncherConfig $nodePath
    $accessMode = $launcherConfig.accessMode
    $dataDir = $launcherConfig.dataDir
    $port = [int]$launcherConfig.port
    $healthUrl = $launcherConfig.localHealthUrl
    $appUrl = $launcherConfig.localAppUrl

    $tailscaleIp = Get-TailscaleIp
    if ($accessMode -eq 'tailscale' -and -not $tailscaleIp) {
        throw '已启用手机访问模式，但 Tailscale 当前没有连接。请先连接 Tailscale，或运行 suowang access local。'
    }
    $localRunning = Test-SuowangHealth $healthUrl
    $remoteRunning = Test-SuowangTailscaleListener $tailscaleIp $port
    $isRunning = if ($accessMode -eq 'tailscale') {
        $localRunning -and $remoteRunning
    } else {
        $localRunning -and -not $remoteRunning
    }

    if (-not $isRunning -and ($localRunning -or $remoteRunning)) {
        Stop-VerifiedSuowangServer $port
        $localRunning = $false
        $remoteRunning = $false
    }

    if (-not $isRunning) {
        $logsDir = Join-Path $dataDir 'logs'
        New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
        $stdoutLog = Join-Path $logsDir 'latest-stdout.log'
        $stderrLog = Join-Path $logsDir 'latest-stderr.log'

        Start-Process `
            -FilePath $nodePath `
            -ArgumentList 'scripts/serve.mjs' `
            -WorkingDirectory $projectRoot `
            -WindowStyle Hidden `
            -RedirectStandardOutput $stdoutLog `
            -RedirectStandardError $stderrLog

        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            Start-Sleep -Milliseconds 250
            $localRunning = Test-SuowangHealth $healthUrl
            $remoteRunning = Test-SuowangTailscaleListener $tailscaleIp $port
            if ($localRunning -and ($accessMode -ne 'tailscale' -or $remoteRunning)) {
                $isRunning = $true
                break
            }
        }
    }

    if (-not $isRunning) {
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
