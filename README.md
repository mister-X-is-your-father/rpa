# rpa

ブラウザ操作・PCタスク自動化のリポジトリ。**動的（LLM操作）** と **静的（決定的スクリプト）** を併存させる構成。

## 構造

```
rpa/
├── ai-rpa/                    # LLM/Claudeが対話的に判断して操作する系
│   ├── mcp/                   #   Playwright MCP (asus-1経由でChrome操作)
│   ├── agents/                #   常駐型エージェント (CDP接続でWindows Chrome操作)
│   └── gemini/                #   Gemini Web UI自動操作
│
├── static-rpa/                # 事前定義された決定的スクリプト
│   └── image-processing/      #   画像処理パイプライン
│
├── shared/                    # 共通ヘルパー・横断ユーティリティ
│   ├── start-chrome.ps1       #   Chromeを CDP モードで起動
│   ├── inspect.js             #   ページセレクタ調査用
│   ├── remote-run.js          #   SSH経由でChrome操作 (one-shot)
│   └── run.js                 #   ローカルランナー
│
└── diag/                      # 診断レコーダー (asus-1向け)
    ├── windows/               #   Windows-side: scheduled task + snapshot
    └── leo/                   #   leo-side: pull/analyze
```

## 概念

| 区分 | 特徴 | 例 |
|---|---|---|
| **ai-rpa** | LLMが現在のページ状態を観察して次のアクションを判断 | Claude Codeから「このフォーム埋めて」 |
| **static-rpa** | 事前にハードコードされたシーケンス | 毎日同じ手順で画像処理 |
| **shared** | 上記両方から呼び出される共通基盤 | Chrome起動、CDP接続 |
| **diag** | RPAではなく観測系 | asus-1のクラッシュ追跡 |

## 関連リポジトリ（このリポ外で管理）

- [wordpress-rpa-custom](https://github.com/mister-X-is-your-father/wordpress-rpa-custom) — WordPress (FSE) 編集用の独立Playwrightツールキット

## 前提

- Node.js 18+
- Tailscale (リモート接続前提の構成)
- Windows + Chrome（CDPモード起動できる必要あり）
- WSL2 (leoホスト想定だが他環境でも動くはず)

## クイックスタート

詳細は各サブディレクトリの `README.md` を参照：
- [ai-rpa/mcp/README.md](ai-rpa/mcp/README.md) — Playwright MCP セットアップ
- [diag/README.md](diag/README.md) — 診断レコーダー
