param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('local', 'tailscale')]
    [string]$Mode
)

$ErrorActionPreference = 'Stop'

function Get-SuowangDataDir {
    if ($env:SUOWANG_DATA_DIR) {
        return [System.IO.Path]::GetFullPath($env:SUOWANG_DATA_DIR)
    }
    if (Test-Path -LiteralPath 'D:/5Data') {
        return 'D:/5Data/suowang'
    }
    return (Join-Path $env:LOCALAPPDATA 'SUOWANG')
}

$dataDir = Get-SuowangDataDir
$accessConfigPath = Join-Path $dataDir 'access.json'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)

if ($Mode -eq 'tailscale') {
    $tailscale = Join-Path $env:ProgramFiles 'Tailscale/tailscale.exe'
    if (-not (Test-Path -LiteralPath $tailscale)) {
        throw '没有找到 Tailscale。请先安装、登录并连接 Tailscale。'
    }
    $addresses = @(@(& $tailscale ip -4 2>$null) | Where-Object { $_ -match '^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.' })
    if ($addresses.Count -ne 1) {
        throw '没有找到唯一的 Tailscale IPv4 地址。请确认 Tailscale 已连接。'
    }
    [System.IO.File]::WriteAllText($accessConfigPath, '{"accessMode":"tailscale"}', $utf8WithoutBom)
    [Environment]::SetEnvironmentVariable('SUOWANG_ACCESS', $null, 'User')
    Write-Output "已启用 SUOWANG 手机访问模式：双击桌面 SUOWANG 后，用手机访问 http://$($addresses[0]):2037/"
    Write-Output '手机必须登录同一 Tailnet；不要把这个地址作为公网链接分享。'
} else {
    [System.IO.File]::WriteAllText($accessConfigPath, '{"accessMode":"local"}', $utf8WithoutBom)
    [Environment]::SetEnvironmentVariable('SUOWANG_ACCESS', $null, 'User')
    [Environment]::SetEnvironmentVariable('SUOWANG_TAILSCALE_IP', $null, 'User')
    Write-Output '已恢复 SUOWANG 仅本机访问模式。再次双击桌面 SUOWANG 后生效。'
}
