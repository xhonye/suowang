$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$stage = '读取启动配置'
$stderrLog = $null

function Get-SuowangLauncherConfig([string]$nodePath) {
    $configJson = & $nodePath (Join-Path $projectRoot 'scripts/launcher-config.mjs')
    if ($LASTEXITCODE -ne 0 -or -not $configJson) {
        throw '无法读取统一启动配置。请检查数据目录环境变量和安装文件。'
    }
    return ($configJson | ConvertFrom-Json)
}

function Get-LauncherDecision([string]$nodePath, [hashtable]$policyInput) {
    $policyPath = Join-Path $projectRoot 'src/server/launcher-policy.mjs'
    $inputJson = $policyInput | ConvertTo-Json -Depth 8 -Compress
    $inputBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($inputJson))
    $decisionJson = & $nodePath $policyPath "--base64=$inputBase64"
    if ($LASTEXITCODE -ne 0 -or -not $decisionJson) {
        throw '启动安全策略没有返回有效结果。请重新安装所往。'
    }
    return ($decisionJson | ConvertFrom-Json)
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
    if (-not (Test-Path -LiteralPath $tailscale)) { return $null }
    $addresses = @(@(& $tailscale ip -4 2>$null) | Where-Object {
        $_ -match '^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.'
    })
    if ($addresses.Count -eq 1) { return $addresses[0] }
    return $null
}

function Get-SuowangHealth([string]$url) {
    try { return Invoke-RestMethod -Uri $url -TimeoutSec 2 } catch { return $null }
}

function Get-ListenerState([int]$port, [string]$accessMode, [string]$tailscaleIp) {
    $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
    $local = $listeners | Where-Object { $_.LocalAddress -eq '127.0.0.1' } | Select-Object -First 1
    $remote = if ($tailscaleIp) {
        $listeners | Where-Object { $_.LocalAddress -eq $tailscaleIp } | Select-Object -First 1
    } else { $null }
    $matches = if ($accessMode -eq 'tailscale') {
        $local -and $remote -and $local.OwningProcess -eq $remote.OwningProcess
    } else {
        $local -and -not $remote
    }
    return @{
        Occupied = $listeners.Count -gt 0
        AccessModeMatches = [bool]$matches
        LocalListener = $local
    }
}

function Get-VerifiedSuowangProcess($health, $listenerState) {
    $listener = $listenerState.LocalListener
    if (-not $listener) { return @{ Verified = $false; Pid = $null } }
    $candidatePid = if ($health -and $health.pid -and [int64]$health.pid -gt 0) {
        [int]$health.pid
    } else {
        [int]$listener.OwningProcess
    }
    if ($candidatePid -ne [int]$listener.OwningProcess) {
        return @{ Verified = $false; Pid = $candidatePid }
    }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$candidatePid" -ErrorAction SilentlyContinue
    $verified = $process `
        -and $process.Name -ieq 'node.exe' `
        -and $process.CommandLine -match 'scripts[/\\]serve\.mjs'
    return @{ Verified = [bool]$verified; Pid = $candidatePid }
}

function Stop-VerifiedSuowangProcess([int]$processId, [int]$port) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
    if (-not $process -or $process.Name -ine 'node.exe' -or $process.CommandLine -notmatch 'scripts[/\\]serve\.mjs') {
        throw "$port 端口上的进程无法确认为 SUOWANG，已拒绝终止以保护其他程序。"
    }
    Stop-Process -Id $processId
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        Start-Sleep -Milliseconds 100
        if (-not (Get-Process -Id $processId -ErrorAction SilentlyContinue)) { break }
    }
    if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
        $stillVerified = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
        if (-not $stillVerified -or $stillVerified.Name -ine 'node.exe' -or $stillVerified.CommandLine -notmatch 'scripts[/\\]serve\.mjs') {
            throw '旧进程未正常退出，且身份已无法再次确认。请重启电脑后再试。'
        }
        Stop-Process -Id $processId -Force
    }
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 100
        $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if (-not $listener) { return }
    }
    throw '旧的 SUOWANG 服务已停止，但端口没有及时释放。请稍后重试。'
}

function Get-ConflictReason([string]$reason, [int]$port) {
    switch ($reason) {
        'port_not_owned_by_suowang' { return "$port 端口已被其他程序占用，SUOWANG 不会终止它。" }
        'suowang_process_unverified' { return '检测到旧服务或模式不匹配，但无法安全验证后台进程身份。' }
        default { return "启动安全检查未通过：$reason" }
    }
}

try {
    $bundledNode = Join-Path $projectRoot 'runtime/node.exe'
    $nodePath = if (Test-Path -LiteralPath $bundledNode -PathType Leaf) {
        $bundledNode
    } else {
        (Get-Command node -ErrorAction Stop).Source
    }
    $nodeMajor = [int]((& $nodePath --version).TrimStart('v').Split('.')[0])
    if ($nodeMajor -notin @(22, 24)) { throw "检测到 Node $nodeMajor。源码入口仅支持 Node 22 或 24 LTS；普通用户请使用自包含安装包。" }

    $launcherConfig = Get-SuowangLauncherConfig $nodePath
    $expectedVersion = [string]$launcherConfig.expectedVersion
    $accessMode = [string]$launcherConfig.accessMode
    $dataDir = [string]$launcherConfig.dataDir
    $port = [int]$launcherConfig.port
    $healthUrl = [string]$launcherConfig.localHealthUrl
    $appUrl = [string]$launcherConfig.localAppUrl
    $logsDir = Join-Path $dataDir 'logs'
    $stdoutLog = Join-Path $logsDir 'latest-stdout.log'
    $stderrLog = Join-Path $logsDir 'latest-stderr.log'

    $stage = '检查现有服务'
    $tailscaleIp = Get-TailscaleIp
    if ($accessMode -eq 'tailscale' -and -not $tailscaleIp) {
        throw '已启用手机访问模式，但 Tailscale 当前没有连接。请先连接 Tailscale，或运行 suowang access local。'
    }
    $health = Get-SuowangHealth $healthUrl
    $listenerState = Get-ListenerState $port $accessMode $tailscaleIp
    $identity = Get-VerifiedSuowangProcess $health $listenerState
    $decision = Get-LauncherDecision $nodePath @{
        expectedVersion = $expectedVersion
        expectedAccessMode = $accessMode
        health = $health
        listener = @{
            occupied = $listenerState.Occupied
            accessModeMatches = $listenerState.AccessModeMatches
        }
        processVerified = $identity.Verified
    }

    if ($decision.action -eq 'conflict') { throw (Get-ConflictReason $decision.reason $port) }
    if ($decision.action -eq 'restart' -and $decision.stopExisting) {
        $stage = '安全切换旧服务'
        Stop-VerifiedSuowangProcess ([int]$identity.Pid) $port
    }

    if ($decision.action -ne 'reuse') {
        $stage = '启动本地服务'
        New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
        Start-Process `
            -FilePath $nodePath `
            -ArgumentList 'scripts/serve.mjs' `
            -WorkingDirectory $projectRoot `
            -WindowStyle Hidden `
            -RedirectStandardOutput $stdoutLog `
            -RedirectStandardError $stderrLog

        $ready = $false
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            Start-Sleep -Milliseconds 250
            $health = Get-SuowangHealth $healthUrl
            $listenerState = Get-ListenerState $port $accessMode $tailscaleIp
            $postDecision = Get-LauncherDecision $nodePath @{
                expectedVersion = $expectedVersion
                expectedAccessMode = $accessMode
                health = $health
                listener = @{
                    occupied = $listenerState.Occupied
                    accessModeMatches = $listenerState.AccessModeMatches
                }
                processVerified = $false
            }
            if ($postDecision.action -eq 'reuse') { $ready = $true; break }
        }
        if (-not $ready) {
            $detail = if (Test-Path -LiteralPath $stderrLog) {
                ((Get-Content -LiteralPath $stderrLog -Tail 12) -join [Environment]::NewLine).Trim()
            } else { '本地服务没有在预期时间内就绪。' }
            throw $detail
        }
    }

    $stage = '打开所往'
    if ($env:SUOWANG_SKIP_BROWSER -ne '1') {
        Start-Process -FilePath $appUrl
    }
} catch {
    $failureMessage = "阶段：$stage`n原因：$($_.Exception.Message)"
    $failureLog = $null
    try {
        $failureDataDir = if ($dataDir) {
            $dataDir
        } elseif ($env:SUOWANG_DATA_DIR) {
            $env:SUOWANG_DATA_DIR
        } else {
            Join-Path $env:LOCALAPPDATA 'SUOWANG'
        }
        $failureLogsDir = Join-Path $failureDataDir 'logs'
        New-Item -ItemType Directory -Force -Path $failureLogsDir | Out-Null
        $failureLog = Join-Path $failureLogsDir 'latest-launcher-error.log'
        Set-Content -LiteralPath $failureLog -Value $failureMessage -Encoding UTF8
    } catch {
        $failureLog = $null
    }
    $logPath = if ($failureLog) { $failureLog } elseif ($stderrLog) { $stderrLog } else { '尚未建立日志文件' }
    Show-StartError "$failureMessage`n日志：$logPath`n下一步：请先按提示处理；若仍失败，请把日志内容发给维护者。"
    exit 1
}
