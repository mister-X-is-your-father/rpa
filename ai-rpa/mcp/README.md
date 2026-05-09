# Playwright MCP over Tailscale

Claude Code (WSL on `leo`) → Tailscale → `asus-1` Windows の Chrome を MCP 経由で操作する構成。

## 構成

```
[leo: Claude Code]
   ↓ MCP/SSE (Tailnet)
[asus-1: @playwright/mcp]
   ↓ CDP
[Chrome --remote-debugging-port=9222]   ← 既存rpa/と共用
```

CDPモードで起動するので、普段使ってるChromeのログイン/拡張/プロファイルがそのまま使える。同じChromeに既存の `~/rpa/agent.js` 等と同居も可能。

## セットアップ

### asus-1 (Windows)

前提: Tailscale起動済 + サインイン済、Node.js 18+ 。

```powershell
# 1. Chromeをデバッグモードで起動
cd ~/rpa
.\start-chrome.ps1

# 2. MCPサーバー起動（別ウィンドウで継続実行）
cd ~/rpa/mcp
.\start-mcp.ps1
```

`start-mcp.ps1` がTailscale疎通とChrome CDPを自動チェック。OKなら `http://0.0.0.0:8931/sse` でMCPサーバー起動。

### leo (Claude Code)

`~/.claude.json` または プロジェクト直下の `.mcp.json` に追加：

```json
{
  "mcpServers": {
    "playwright-remote": {
      "type": "sse",
      "url": "http://asus-1.tail65add4.ts.net:8931/sse"
    }
  }
}
```

Claude Code を再起動すると `mcp__playwright-remote__*` ツール群が利用可能に。

## 提供されるツール（@playwright/mcp v0.0.x）

- `browser_navigate` — URL遷移
- `browser_click` — 要素クリック
- `browser_type` — テキスト入力
- `browser_snapshot` — accessibility tree取得（軽量、LLM向け）
- `browser_screenshot` — スクリーンショット
- `browser_press_key` — キー入力
- `browser_select_option` — selectボックス操作
- `browser_handle_dialog` — alert/confirm処理
- 他多数

## カスタマイズ余地

- **HTTPS化**: `tailscale serve --bg --https=8443 http://localhost:8931` で `https://asus-1.tail<XXXXX>.ts.net:8443/sse` に切り替え可（証明書付き）
- **ポート変更**: `start-mcp.ps1` の `$Port` を変更
- **複数Chromeプロファイル**: `--user-data-dir` を分けて並行起動、`--remote-debugging-port` も別ポートに
- **認証**: 現状Tailnet閉鎖前提でMCP自体に認証なし。必要ならリバースプロキシ前段で

## 永続化（auto-start）

Phase 3で対応予定。タスクスケジューラ or NSSM経由でWindows起動時に自動立ち上げ。

## 既存rpa/との関係

| 用途 | 推奨 |
|---|---|
| Claude Codeから対話的にブラウザ操作 | **MCP（このフォルダ）** |
| WSL側からスクリプトでChrome制御 | `~/rpa/remote-run.js` 等 既存活用 |
| ユーザーPC常駐エージェント形式（HTTP/Polling） | `~/rpa/agent.js`, `agent-push.js` 既存活用 |

3方式が同じChrome (port 9222) に同時接続可能。
