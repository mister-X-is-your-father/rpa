# 診断スナップショット (定期 + イベント発火 両用)
# 出力: C:\Logs\diag\YYYY-MM-DD\HHMMSS_<reason>.txt

param(
    [string]$Reason = "scheduled"
)

$ErrorActionPreference = "Continue"
$now = Get-Date
$dateDir = $now.ToString("yyyy-MM-dd")
$timeStamp = $now.ToString("HHmmss")
$outDir = "C:\Logs\diag\$dateDir"
$outFile = "$outDir\${timeStamp}_${Reason}.txt"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Section($title) { "`n=== $title === [$($now.ToString('yyyy-MM-dd HH:mm:ss'))]" | Out-File $outFile -Append }

Section "Reason: $Reason"
Section "OS / Uptime"
Get-CimInstance Win32_OperatingSystem | Select Caption,Version,LastBootUpTime,FreePhysicalMemory,TotalVisibleMemorySize | Format-List | Out-File $outFile -Append

Section "CPU / Memory Top10"
Get-Process | Sort-Object CPU -Descending | Select -First 10 ProcessName,Id,CPU,@{n='MemMB';e={[int]($_.WS/1MB)}} | Format-Table -AutoSize | Out-File $outFile -Append

Section "Tailscale Status"
& tailscale status 2>&1 | Out-File $outFile -Append
& tailscale netcheck 2>&1 | Out-File $outFile -Append

Section "Tailscale Service"
Get-Service Tailscale -ErrorAction SilentlyContinue | Format-List Name,Status,StartType | Out-File $outFile -Append
Get-Process tailscaled -ErrorAction SilentlyContinue | Format-List ProcessName,CPU,@{n='MemMB';e={[int]($_.WS/1MB)}},StartTime | Out-File $outFile -Append

Section "Tailscale Recent Log Tail"
$tsLog = Get-ChildItem "$env:ProgramData\Tailscale\Logs\*.log" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($tsLog) { Get-Content $tsLog.FullName -Tail 50 | Out-File $outFile -Append }

Section "Network Adapters (Tailscale interface)"
Get-NetAdapter | Where-Object { $_.Name -match "Tailscale" -or $_.InterfaceDescription -match "Tailscale" } | Format-List Name,Status,LinkSpeed,MacAddress | Out-File $outFile -Append

Section "Application Errors (last 30 min)"
Get-WinEvent -FilterHashtable @{LogName='Application'; Level=1,2; StartTime=$now.AddMinutes(-30)} -MaxEvents 30 -ErrorAction SilentlyContinue |
    Select TimeCreated,ProviderName,Id,@{n='Msg';e={$_.Message.Substring(0,[Math]::Min(300,$_.Message.Length))}} |
    Format-Table -AutoSize -Wrap | Out-File $outFile -Append

Section "System Errors (last 30 min)"
Get-WinEvent -FilterHashtable @{LogName='System'; Level=1,2; StartTime=$now.AddMinutes(-30)} -MaxEvents 30 -ErrorAction SilentlyContinue |
    Select TimeCreated,ProviderName,Id,@{n='Msg';e={$_.Message.Substring(0,[Math]::Min(300,$_.Message.Length))}} |
    Format-Table -AutoSize -Wrap | Out-File $outFile -Append

Section "PAD Logs (latest 3 modified)"
$padDir = "$env:LOCALAPPDATA\Microsoft\Power Automate Desktop\Logs"
if (Test-Path $padDir) {
    Get-ChildItem $padDir -Recurse -File | Sort-Object LastWriteTime -Descending | Select -First 3 FullName,LastWriteTime,Length |
        Format-Table -AutoSize | Out-File $outFile -Append
}

Section "Disk Free"
Get-PSDrive -PSProvider FileSystem | Select Name,@{n='UsedGB';e={[int]($_.Used/1GB)}},@{n='FreeGB';e={[int]($_.Free/1GB)}} | Format-Table | Out-File $outFile -Append

# 7日以上古いログを削除（ローテーション）
Get-ChildItem C:\Logs\diag -Directory -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt $now.AddDays(-7) } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Snapshot written: $outFile"
