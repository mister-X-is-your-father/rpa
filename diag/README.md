# Diag Recorder

asus-1 (Windows) 上で常時稼働する診断ロガー。クラッシュ・フリーズ・サービス停止・予期せぬシャットダウンを検出して自動的にスナップショットを残し、復旧後に leo から回収・分析できる。

## 検出するイベント

| 種別 | 検出方法 |
|---|---|
| 通常稼働状態 | 10分毎の定期スナップショット |
| アプリクラッシュ | Application log Event ID 1000/1001/1002 |
| .NET未処理例外 | Event ID 1023/1025 |
| 予期せぬシャットダウン | Kernel-Power Event ID 41 |
| 異常終了からの復帰 | Event ID 6008 |
| サービス停止/再起動 | Event ID 7036/7041 |
| 起動時 | システム起動完了タイミング |

## 各スナップショットの内容

- OS情報、Uptime、空きメモリ
- プロセスTop10（CPU/メモリ）
- Tailscale status / netcheck / サービス状態 / プロセス情報
- Tailscale ログ末尾50行
- Tailscale ネットワークアダプタ情報
- Application/Systemイベントログ（直近30分のerror/critical）
- PADログファイル（直近3つ）
- ディスク空き容量

ログ場所: `C:\Logs\diag\YYYY-MM-DD\HHMMSS_<reason>.txt`

reason: `scheduled` / `boot` / `event` のいずれか

ローテーション: 7日経過したディレクトリは自動削除。

## セットアップ手順

### asus-1 (1回だけ)

このリポジトリ全体（`~/rpa/`）をasus-1に転送してから：

```powershell
# 管理者PowerShell
cd C:\path\to\rpa\diag\windows
.\install.ps1
```

これで以下が自動セットアップされる：
- `C:\Logs\diag\` 作成
- スケジュールタスク3種登録 (Periodic / Boot / OnCriticalEvent)
- OpenSSH Server 有効化 + Firewall 規則
- `%USERPROFILE%\.ssh\authorized_keys` 準備（中身は空）

### leo の公開鍵を asus-1 に登録

leo側で:
```bash
cat ~/.ssh/id_ed25519.pub
```
出力をコピーして、asus-1の `%USERPROFILE%\.ssh\authorized_keys` に追記（PowerShell の `notepad`等で）。

leo側で疎通確認:
```bash
ssh <ASUS-USERNAME>@asus-1 'whoami'
```

通れば設定完了。

## 使い方

### 復旧後に leo から回収

```bash
cd ~/rpa/diag/leo
chmod +x pull.sh analyze.sh
./pull.sh                  # 過去24時間のみ
./pull.sh --full           # 全期間
```

回収先: `~/asus1-diag/<date>/<HHMMSS>_<reason>.txt`

### インシデント分析

```bash
./analyze.sh               # 過去24時間のイベント発火を抽出
./analyze.sh 72            # 過去72時間
```

異常を含むスナップショットファイルを一覧表示。詳細は `cat <ファイル>` で確認。

## 動作確認

asus-1 上で：
```powershell
# 即時スナップショット
Start-ScheduledTask -TaskName DiagRecorder-Periodic
Start-Sleep 5
Get-ChildItem C:\Logs\diag -Recurse | Sort LastWriteTime -Desc | Select -First 1

# 登録済タスク確認
Get-ScheduledTask -TaskName "DiagRecorder-*" | Format-Table TaskName,State
```

## トラブル

- スナップショットが出ない → `Get-ScheduledTask -TaskName DiagRecorder-Periodic | Get-ScheduledTaskInfo` で LastRunTime / LastTaskResult 確認
- SSH接続失敗 → asus-1のFirewallで `port 22` Inbound許可されてるか
- ログだけ大きすぎる → `snapshot.ps1` の各セクションを必要に応じて間引く

## 拡張余地

- leo側にも同等のロガーを設置（systemd timer + journalctl）
- インシデント検出時にntfyへ通知push（既存のntfyに乗せる）
- ログをleoへリアルタイムストリーム（Tailscale切断耐性のため要検討）
