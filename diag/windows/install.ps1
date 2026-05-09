# 診断レコーダー一発インストーラー (asus-1で管理者PowerShellから実行)
# - C:\Logs\diag ディレクトリ作成
# - スケジュールタスク3種登録（10分毎 / イベント発火 / 起動時）
# - OpenSSH Server 有効化（leoからのリモートpull用）

#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$snapshotPs1 = Join-Path $scriptDir "snapshot.ps1"

Write-Host "=== 診断レコーダー インストール開始 ===" -ForegroundColor Cyan

# === 1. ログディレクトリ ===
New-Item -ItemType Directory -Force -Path "C:\Logs\diag" | Out-Null
Write-Host "✓ C:\Logs\diag 作成"

# === 2. スケジュールタスク登録 ===
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$snapshotPs1`" -Reason scheduled"
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest

# 10分毎
$trigger10min = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Days 365)
Register-ScheduledTask -TaskName "DiagRecorder-Periodic" -Action $action -Trigger $trigger10min -Principal $principal -Force | Out-Null
Write-Host "✓ DiagRecorder-Periodic (10分毎)"

# 起動時
$triggerBoot = New-ScheduledTaskTrigger -AtStartup
$actionBoot = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$snapshotPs1`" -Reason boot"
Register-ScheduledTask -TaskName "DiagRecorder-Boot" -Action $actionBoot -Trigger $triggerBoot -Principal $principal -Force | Out-Null
Write-Host "✓ DiagRecorder-Boot (起動時)"

# クリティカルイベント発火時
$xmlSubscription = @"
<QueryList>
  <Query Id="0">
    <Select Path="Application">*[System[(Level=1 or Level=2) and (EventID=1000 or EventID=1001 or EventID=1002 or EventID=1023 or EventID=1025)]]</Select>
    <Select Path="System">*[System[(Level=1 or Level=2) and (EventID=41 or EventID=6008 or EventID=7036 or EventID=7041)]]</Select>
  </Query>
</QueryList>
"@
$cimTrigger = Get-CimClass -Namespace ROOT\Microsoft\Windows\TaskScheduler -ClassName MSFT_TaskEventTrigger
$triggerEvent = New-CimInstance -CimClass $cimTrigger -Property @{Subscription=$xmlSubscription; Enabled=$true} -ClientOnly
$actionEvent = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$snapshotPs1`" -Reason event"
Register-ScheduledTask -TaskName "DiagRecorder-OnCriticalEvent" -Action $actionEvent -Trigger $triggerEvent -Principal $principal -Force | Out-Null
Write-Host "✓ DiagRecorder-OnCriticalEvent (クラッシュ/フリーズ検出時)"

# === 3. OpenSSH Server 有効化（leoから回収用） ===
Write-Host "`n--- OpenSSH Server セットアップ ---" -ForegroundColor Cyan
$ssh = Get-WindowsCapability -Online -Name OpenSSH.Server*
if ($ssh.State -ne 'Installed') {
    Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 | Out-Null
    Write-Host "✓ OpenSSH Server インストール"
} else {
    Write-Host "○ OpenSSH Server 既にインストール済"
}
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
Write-Host "✓ sshd 起動 + 自動起動"

if (-not (Get-NetFirewallRule -Name sshd -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH SSH Server' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 | Out-Null
    Write-Host "✓ Firewall規則追加"
} else {
    Write-Host "○ Firewall規則 既存"
}

# === 4. authorized_keys 用ディレクトリ準備 ===
$sshDir = "$env:USERPROFILE\.ssh"
New-Item -ItemType Directory -Force -Path $sshDir | Out-Null
$authKeys = "$sshDir\authorized_keys"
if (-not (Test-Path $authKeys)) { New-Item -ItemType File -Path $authKeys | Out-Null }
icacls $authKeys /inheritance:r /grant "${env:USERNAME}:F" /grant "SYSTEM:F" 2>&1 | Out-Null
Write-Host "✓ ~/.ssh/authorized_keys 準備（leo側の公開鍵を追記すべし）"

Write-Host "`n=== インストール完了 ===" -ForegroundColor Green
Write-Host ""
Write-Host "次のステップ:" -ForegroundColor Yellow
Write-Host "  1. 即座にスナップショット動作確認:"
Write-Host "     Start-ScheduledTask -TaskName DiagRecorder-Periodic"
Write-Host "     Get-ChildItem C:\Logs\diag -Recurse | Sort LastWriteTime -Desc | Select -First 1"
Write-Host ""
Write-Host "  2. leo側からSSH公開鍵を追加:"
Write-Host "     leoで:  cat ~/.ssh/id_ed25519.pub"
Write-Host "     その出力を $authKeys に追記"
Write-Host ""
Write-Host "  3. leoから疎通確認:"
Write-Host "     ssh $env:USERNAME@asus-1 'whoami'"
