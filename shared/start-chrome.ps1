# Chrome をデバッグモードで起動するスクリプト
# 使い方: PowerShellで .\start-chrome.ps1

Write-Host "Chrome を全て閉じています..."
Stop-Process -Name chrome -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "Chrome をデバッグモードで起動中..."
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList @(
    "--remote-debugging-port=9222",
    "--user-data-dir=$env:LOCALAPPDATA\Google\Chrome\User Data"
)

Start-Sleep -Seconds 3

Write-Host "CDPポート確認中..."
try {
    $response = Invoke-WebRequest -Uri "http://localhost:9222/json/version" -UseBasicParsing -TimeoutSec 5
    Write-Host "OK! Chrome CDP 起動済み" -ForegroundColor Green
    Write-Host $response.Content
} catch {
    Write-Host "まだ起動していません。chrome://inspect/#remote-debugging を開いて" -ForegroundColor Yellow
    Write-Host "'Allow remote debugging for this browser instance' をONにしてください" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "次のステップ: npx ts-node src/gemini-rpa.ts" -ForegroundColor Cyan
