# Chrome をデバッグモード(CDP)で起動するスクリプト
# 使い方: PowerShellで .\start-chrome.ps1

# === 既存Chrome終了 ===
Write-Host "Chrome を全て閉じています..."
Stop-Process -Name chrome -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# === 既に CDP モードで動いてるなら何もしない（idempotent） ===
try {
    $existing = Invoke-WebRequest -Uri "http://localhost:9222/json/version" -UseBasicParsing -TimeoutSec 1
    Write-Host "既にCDPモードで起動中、スキップ" -ForegroundColor Green
    Write-Host $existing.Content
    exit 0
} catch {}

# === Chrome 起動 ===
Write-Host "Chrome をデバッグモードで起動中..."
$chromeExe = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$dataDir = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data"

# パスにスペースが含まれるので & 演算子で個別引数として渡す
# (Start-Process -ArgumentList @ だとスペース分割される問題回避)
Start-Process -FilePath $chromeExe -ArgumentList @(
    "--remote-debugging-port=9222",
    "`"--user-data-dir=$dataDir`""
)

Start-Sleep -Seconds 3

# === 起動確認 ===
Write-Host "CDPポート確認中..."
$retries = 5
$ok = $false
for ($i = 0; $i -lt $retries; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:9222/json/version" -UseBasicParsing -TimeoutSec 3
        Write-Host "OK! Chrome CDP 起動済み" -ForegroundColor Green
        Write-Host $response.Content
        $ok = $true
        break
    } catch {
        Start-Sleep -Seconds 2
    }
}

if (-not $ok) {
    Write-Host "起動失敗：CDPポート9222が応答しない" -ForegroundColor Red
    Write-Host "  Chromeの拡張やセキュリティソフトがブロックしてる可能性" -ForegroundColor Yellow
    exit 1
}
