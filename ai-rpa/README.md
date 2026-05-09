# ai-rpa

LLM/Claudeが現在のページ状態を観察して**動的に判断・操作する**系の自動化。

## サブディレクトリの役割

```
ai-rpa/
├── mcp/        ← 標準プロトコル: Microsoft Playwright MCP経由
├── agents/     ← 自前プロトコル: HTTPポーリング/SSH経由のCDP制御
└── gemini/     ← アプリ特化: Gemini Web UIのスクリプト
```

| サブディレクトリ | プロトコル | 接続方式 | 主用途 |
|---|---|---|---|
| **mcp/** | MCP (公式) | SSE/HTTP | Claude Codeがツールとして直接利用、対話的Webブラウジング |
| **agents/** | 独自HTTP/SSE | CDP直接 | 常駐デーモン型、複数指示を投げる長期セッション |
| **gemini/** | TS(Playwright) | CDP直接 | Gemini Web UIの定型操作（プロンプト送信→出力取得） |

## 使い分けの目安

- **新規にClaudeから対話的にブラウザ操作したい** → `mcp/`（MCPサーバー立てる）
- **Gemini固有の操作（prompt送信→画像保存等）** → `gemini/`
- **WSL外部から指示を投げてChromeを動かす独自フロー** → `agents/`

## 共通基盤

すべて [`shared/start-chrome.ps1`](../shared/start-chrome.ps1) でChromeをCDPモード起動した状態を前提とする（port 9222）。
