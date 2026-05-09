# Tailscale疑惑切り分け診断スクリプト (asus-1で実行)
# PowerShellを管理者で開いて: .\tailscale-diag.ps1

Write-Host "=== Tailscale バージョン ===" -ForegroundColor Cyan
& tailscale version

Write-Host "`n=== Tailscale ステータス ===" -ForegroundColor Cyan
& tailscale status

Write-Host "`n=== Tailscale サービス状態 ===" -ForegroundColor Cyan
Get-Service Tailscale | Format-List Name, Status, StartType

Write-Host "`n=== tailscaled プロセスCPU/メモリ ===" -ForegroundColor Cyan
Get-Process tailscaled -ErrorAction SilentlyContinue | Format-List ProcessName,CPU,WS,VirtualMemorySize64

Write-Host "`n=== 直近24時間のTailscaleログのエラー ===" -ForegroundColor Cyan
$logDir = "$env:ProgramData\Tailscale\Logs"
if (Test-Path $logDir) {
    Get-ChildItem $logDir -Filter "*.log" | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object {
        Write-Host "ファイル: $($_.FullName)"
        Get-Content $_.FullName -Tail 200 | Select-String -Pattern "error|fail|panic|crash|warn" -CaseSensitive:$false | Select-Object -Last 20
    }
} else {
    Write-Host "ログディレクトリ未存在: $logDir"
}

Write-Host "`n=== Windows イベント: 直近24h アプリケーション エラー（PAD/Tailscale関連） ===" -ForegroundColor Cyan
Get-WinEvent -FilterHashtable @{LogName='Application'; Level=1,2,3; StartTime=(Get-Date).AddHours(-24)} -MaxEvents 50 -ErrorAction SilentlyContinue |
    Where-Object { $_.ProviderName -match "Tailscale|PowerAutomate|Flow|.NET Runtime|Application Error" } |
    Select-Object TimeCreated, ProviderName, Id, Message |
    Format-Table -AutoSize -Wrap

Write-Host "`n=== クリップボード掴んでる可能性のある常駐プロセス ===" -ForegroundColor Cyan
Get-Process | Where-Object { $_.ProcessName -match "clip|ditto|rdp|mstsc|parsec|anydesk|teamviewer|chrome.*remote" } |
    Select-Object ProcessName, Id, WS | Format-Table -AutoSize

Write-Host "`n=== PAD ログファイル（直近変更分） ===" -ForegroundColor Cyan
$padLogDir = "$env:LOCALAPPDATA\Microsoft\Power Automate Desktop\Logs"
if (Test-Path $padLogDir) {
    Get-ChildItem $padLogDir -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 5 | Format-Table FullName, LastWriteTime, Length -AutoSize
} else {
    Write-Host "PADログ未存在: $padLogDir"
}

Write-Host "`n=== 完了 ===" -ForegroundColor Green
Write-Host "出力をleo側に共有するなら以下で:" -ForegroundColor Yellow
Write-Host "  .\tailscale-diag.ps1 *>&1 | Out-File diag-output.txt"
