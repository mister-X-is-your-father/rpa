# Chrome を CDP モードで起動するスクリプト
# 使い方: PowerShellで .\start-chrome.ps1
#
# 注: Chrome 136+ ではセキュリティ上の理由でメインプロファイル(User Data)では
# --remote-debugging-port がサイレント無効化されるため、専用プロファイルを使う。
# 専用プロファイルへのGoogle等ログインは初回手動で（その後永続）。

# === 設定 ===
$ChromeExe = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$DataDir = Join-Path $env:LOCALAPPDATA "Google\Chrome\RpaProfile"  # ← 専用プロファイル
$Port = 9222

# === 既に CDP モードで動いてるなら何もしない（idempotent） ===
try {
    $existing = Invoke-WebRequest -Uri "http://localhost:$Port/json/version" -UseBasicParsing -TimeoutSec 1
    Write-Host "既にCDPモードで起動中、スキップ" -ForegroundColor Green
    Write-Host $existing.Content
    exit 0
} catch {}

# === 既存の RPA Chrome のみ終了 (メインChromeには触らない) ===
$rpaProcs = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$DataDir*" }
if ($rpaProcs) {
    Write-Host "既存RPA Chromeを終了..."
    $rpaProcs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
}

# === 専用プロファイルディレクトリ確保 ===
if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
    Write-Host "専用プロファイル作成: $DataDir"
}

# === 起動 ===
Write-Host "Chrome (RPA専用プロファイル) を CDP モードで起動..."
Start-Process -FilePath $ChromeExe -ArgumentList @(
    "--remote-debugging-port=$Port",
    "`"--user-data-dir=$DataDir`"",
    "--no-first-run",
    "--no-default-browser-check"
)

Start-Sleep -Seconds 3

# === 起動確認 (リトライ) ===
Write-Host "CDPポート確認中..."
$retries = 5
$ok = $false
for ($i = 0; $i -lt $retries; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$Port/json/version" -UseBasicParsing -TimeoutSec 3
        Write-Host "OK! Chrome CDP 起動済み (port $Port)" -ForegroundColor Green
        Write-Host $response.Content
        $ok = $true
        break
    } catch {
        Start-Sleep -Seconds 2
    }
}

if (-not $ok) {
    Write-Host "起動失敗：CDPポート$Portが応答しない" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "メモ: このChromeはRPA専用。Google等のログインは初回手動で。" -ForegroundColor Cyan
Write-Host "プロファイル: $DataDir" -ForegroundColor Cyan
