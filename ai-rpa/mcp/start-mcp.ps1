# Playwright MCP サーバーを Tailscale 越しに公開して起動するスクリプト
# 前提: ../start-chrome.ps1 で Chrome が --remote-debugging-port=9222 で起動済み

# === 設定 ===
$Port = 8931                                        # MCPサーバーがlistenするポート
$CdpEndpoint = "http://localhost:9222"              # 既存Chromeへの接続先
$Host_ = "0.0.0.0"                                  # Tailnet含む全インターフェースで待ち受け

# === Tailscale疎通チェック ===
$tsStatus = & tailscale status 2>$null
if ($LASTEXITCODE -ne 0 -or -not $tsStatus) {
    Write-Host "⚠ Tailscale が動いていません。先に Tailscale を起動してサインインしてください" -ForegroundColor Yellow
    exit 1
}

# Tailscale IP取得（情報表示用）
$tsIp = (& tailscale ip -4 2>$null | Select-Object -First 1).Trim()
$tsHost = (hostname).ToLower()

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
Write-Host "leo側 Claude Code から:  http://${tsHost}.tail<XXXXX>.ts.net:${Port}/sse" -ForegroundColor Cyan
Write-Host ""

npx -y "@playwright/mcp@latest" `
    --port $Port `
    --host $Host_ `
    --cdp-endpoint $CdpEndpoint
