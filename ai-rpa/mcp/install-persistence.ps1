# asus-1 永続化インストーラー
# Task Schedulerに「ログオン時にChrome+MCPサーバー自動起動」を登録
# 使い方: 管理者PowerShellで .\install-persistence.ps1
# アンインストール: .\install-persistence.ps1 -Uninstall

param(
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

# === パス解決 ===
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent $here)
$startChrome = Join-Path $repoRoot "shared\start-chrome.ps1"
$startMcp = Join-Path $here "start-mcp.ps1"

$ChromeTask = "RPA-Chrome-CDP"
$McpTask = "RPA-MCP-Server"

# === Uninstall ===
if ($Uninstall) {
    foreach ($t in @($ChromeTask, $McpTask)) {
        if (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue) {
            Unregister-ScheduledTask -TaskName $t -Confirm:$false
            Write-Host "✓ Removed: $t"
        }
    }
    exit 0
}

# === Pre-flight ===
foreach ($p in @($startChrome, $startMcp)) {
    if (-not (Test-Path $p)) {
        Write-Host "✗ Not found: $p" -ForegroundColor Red
        exit 1
    }
}

# === Chrome タスク (ログオン時) ===
$chromeAction = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$startChrome`""

$chromeTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$chromeSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
    -StartWhenAvailable

$chromePrincipal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
    -TaskName $ChromeTask `
    -Action $chromeAction `
    -Trigger $chromeTrigger `
    -Settings $chromeSettings `
    -Principal $chromePrincipal `
    -Description "Auto-start Chrome with --remote-debugging-port=9222 at logon" `
    -Force | Out-Null
Write-Host "✓ Registered: $ChromeTask"

# === MCP タスク (ログオン30秒後、失敗時自動再起動) ===
$mcpAction = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startMcp`""

$mcpTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$mcpTrigger.Delay = "PT30S"

$mcpSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1)

$mcpPrincipal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
    -TaskName $McpTask `
    -Action $mcpAction `
    -Trigger $mcpTrigger `
    -Settings $mcpSettings `
    -Principal $mcpPrincipal `
    -Description "Auto-start Playwright MCP server at logon (30s after login, with restart-on-failure)" `
    -Force | Out-Null
Write-Host "✓ Registered: $McpTask (delayed 30s, auto-restart enabled)"

# === 完了表示 ===
Write-Host ""
Write-Host "=== 永続化設定完了 ===" -ForegroundColor Green
Write-Host ""
Write-Host "次のWindows再起動 / ログオフ→ログオンから自動起動されます。"
Write-Host ""
Write-Host "今すぐ動作確認したい場合:"
Write-Host "  Start-ScheduledTask -TaskName $ChromeTask"
Write-Host "  Start-Sleep 5"
Write-Host "  Start-ScheduledTask -TaskName $McpTask"
Write-Host ""
Write-Host "状態確認:"
Write-Host "  Get-ScheduledTask -TaskName 'RPA-*' | Format-Table TaskName,State,LastRunTime,LastTaskResult"
Write-Host ""
Write-Host "アンインストール:"
Write-Host "  .\install-persistence.ps1 -Uninstall"
