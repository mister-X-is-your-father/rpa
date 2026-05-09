#!/bin/bash
# 回収した診断ログから直近の異常イベントを抽出
# 使い方: ./analyze.sh [hours]   デフォルト24時間

HOURS="${1:-24}"
LOCAL_DIR="$HOME/asus1-diag"

if [ ! -d "$LOCAL_DIR" ]; then
    echo "回収済ログなし。先に ./pull.sh 実行を" >&2
    exit 1
fi

CUTOFF=$(date -d "$HOURS hours ago" +%s)

echo "=== 過去${HOURS}時間のイベント発火スナップショット ==="
find "$LOCAL_DIR" -name "*_event.txt" -newer /tmp/.dummy 2>/dev/null
find "$LOCAL_DIR" -name "*_event.txt" 2>/dev/null | while read f; do
    mtime=$(stat -c %Y "$f" 2>/dev/null || echo 0)
    if [ "$mtime" -gt "$CUTOFF" ]; then
        echo
        echo "▼ $(basename "$f") @ $(date -d @$mtime '+%Y-%m-%d %H:%M:%S')"
        grep -A2 "Application Errors\|System Errors\|Tailscale Status" "$f" | head -30
    fi
done

echo
echo "=== Tailscale接続切断/エラー出現スナップショット ==="
grep -lE "PollNetMap|connection refused|panic|tailscaled.*error" "$LOCAL_DIR"/*/*.txt 2>/dev/null | tail -10

echo
echo "=== クラッシュ・ハング ==="
grep -lE "Application Hang|Application Error|0xc0000|FaultBucket|Kernel-Power" "$LOCAL_DIR"/*/*.txt 2>/dev/null | tail -10

echo
echo "詳細を見るには:  cat <ファイルパス>"
