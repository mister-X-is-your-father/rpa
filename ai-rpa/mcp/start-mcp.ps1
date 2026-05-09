# Playwright MCP サーバーを Tailscale 越しに公開して起動するスクリプト
# 前提: ../start-chrome.ps1 で Chrome が --remote-debugging-port=9222 で起動済み

# === 設定 ===
$Port = 8931                                        # MCPサーバーがlistenするポート
$CdpEndpoint = "http://localhost:9222"              # 既存Chromeへの接続先
$Host_ = "0.0.0.0"                                  # Tailnet含む全インターフェースで待ち受け
$ServePort = 8443                                   # tailscale serve --https=ポート（HTTPSプロキシ）

# === Tailscale疎通チェック ===
$tsStatus = & tailscale status 2>$null
if ($LASTEXITCODE -ne 0 -or -not $tsStatus) {
    Write-Host "⚠ Tailscale が動いていません。先に Tailscale を起動してサインインしてください" -ForegroundColor Yellow
    exit 1
}

# Tailscale IP / FQDN 取得（情報表示・--allowed-hosts用）
$tsIp = (& tailscale ip -4 2>$null | Select-Object -First 1).Trim()
$tsHost = (hostname).ToLower()
$tsState = & tailscale status --json 2>$null | ConvertFrom-Json -ErrorAction SilentlyContinue
$dnsName = if ($tsState) { $tsState.Self.DNSName.TrimEnd('.') } else { "" }

# DNS rebinding protectionを通すため、想定される接続先Hostを許可リストに追加
$AllowedHosts = @("localhost:$Port", "127.0.0.1:$Port")
if ($dnsName) {
    $AllowedHosts += "${dnsName}:$Port"
    $AllowedHosts += "${dnsName}:$ServePort"
    $AllowedHosts += $dnsName
}
$AllowedHostsArg = $AllowedHosts -join ","

# === Chrome CDP疎通チェック ===
try {
    $resp = Invoke-WebRequest -Uri "$CdpEndpoint/json/version" -UseBasicParsing -TimeoutSec 3
    Write-Host "✓ Chrome CDP 接続OK ($CdpEndpoint)" -ForegroundColor Green
} catch {
    Write-Host "✗ Chrome CDP に繋がりません ($CdpEndpoint)" -ForegroundColor Red
    Write-Host "  start-chrome.ps1 を先に実行してください" -ForegroundColor Yellow
    exit 1
}

# === MCPサーバー起動 ===
Write-Host ""
Write-Host "Playwright MCP サーバー起動中..." -ForegroundColor Cyan
Write-Host "  Listen   : http://${Host_}:${Port}"
Write-Host "  CDP      : $CdpEndpoint"
Write-Host "  Tailnet  : http://${tsHost}:${Port} (= http://${tsIp}:${Port})"
Write-Host ""
Write-Host "leo側 Claude Code から:  https://${dnsName}:${ServePort}/sse (要 tailscale serve)" -ForegroundColor Cyan
Write-Host "Allowed Hosts: $AllowedHostsArg"
Write-Host ""

npx -y "@playwright/mcp@latest" `
    --port $Port `
    --host $Host_ `
    --cdp-endpoint $CdpEndpoint `
    --allowed-hosts $AllowedHostsArg
