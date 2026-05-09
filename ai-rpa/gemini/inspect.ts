/**
 * Gemini UIのセレクタ調査用スクリプト
 *
 * ログイン済みChromeプロファイルでGeminiを開いて、
 * page.pause() で Playwright Inspector を起動する。
 * Inspector上で要素をクリックするとセレクタが表示される。
 */
import { chromium } from "playwright";
import { config } from "./config";

async function main() {
  console.log("Chrome起動中 (ログイン済みプロファイル)...");
  console.log("※ 既にChromeが開いている場合は閉じてください\n");

  const context = await chromium.launchPersistentContext(
    config.chrome.userDataDir,
    {
      executablePath: config.chrome.executablePath,
      headless: false,
      args: [
        `--profile-directory=${config.chrome.profile}`,
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--no-default-browser-check",
      ],
      viewport: { width: 1280, height: 900 },
      ignoreDefaultArgs: ["--enable-automation"],
    }
  );

  const page = context.pages()[0] || (await context.newPage());

  console.log("Geminiに移動中...");
  await page.goto(config.gemini.url, { waitUntil: "domcontentloaded" });

  console.log(`
╔══════════════════════════════════════════════════════════╗
║  Playwright Inspector が開きます                         ║
║                                                          ║
║  使い方:                                                 ║
║  1. Inspectorの「Pick locator」ボタン(標的アイコン)を押す ║
║  2. Gemini上の要素をクリック → セレクタが表示される       ║
║  3. 以下の要素のセレクタをメモしてください:               ║
║     - プロンプト入力欄                                   ║
║     - 送信ボタン                                         ║
║     - 画像アップロードボタン                              ║
║     - 生成された画像                                     ║
║     - ダウンロードボタン                                  ║
║     - 新しいチャットボタン                                ║
║  4. 終わったら Inspector で「Resume」を押すと終了         ║
╚══════════════════════════════════════════════════════════╝
`);

  await page.pause();

  await context.close();
  console.log("完了");
}

main().catch(console.error);
