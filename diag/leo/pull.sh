#!/bin/bash
# asus-1から診断ログをleoに回収
# 使い方: ./pull.sh [--full]
#   --full: 全期間をrsync（デフォルトは過去24時間のみ）

set -euo pipefail

REMOTE_HOST="${ASUS_HOST:-asus-1}"
REMOTE_USER="${ASUS_USER:-$USER}"
REMOTE_PATH='/c/Logs/diag/'
LOCAL_DIR="$HOME/asus1-diag"

mkdir -p "$LOCAL_DIR"

if [ "${1:-}" = "--full" ]; then
    echo "[*] 全期間 rsync"
    rsync -avz --partial -e "ssh -o ConnectTimeout=5" \
        "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}" "$LOCAL_DIR/"
else
    YESTERDAY=$(date -d "yesterday" +%Y-%m-%d)
    TODAY=$(date +%Y-%m-%d)
    echo "[*] 過去24時間 ($YESTERDAY, $TODAY) のみ pull"
    for d in "$YESTERDAY" "$TODAY"; do
        rsync -avz --partial -e "ssh -o ConnectTimeout=5" \
            "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}${d}/" "$LOCAL_DIR/${d}/" 2>/dev/null || true
    done
fi

echo "[*] 回収完了: $LOCAL_DIR"
echo
echo "[*] 直近5件:"
ls -lt "$LOCAL_DIR"/*/*.txt 2>/dev/null | head -5
