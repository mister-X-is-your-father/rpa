/**
 * CDP接続でGeminiのセレクタを調査するスクリプト
 * ユーザーのPC上で直接実行する
 */
import { chromium } from "playwright";

async function main() {
  console.log("Chrome (CDP) に接続中...");
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0];
  const page = context.pages()[0] || (await context.newPage());

  console.log("Geminiに移動中...");
  await page.goto("https://gemini.google.com/app", { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 5000));

  console.log("ページ読み込み完了。セレクタを調査中...\n");

  // プロンプト入力欄を探す
  const inputCandidates = [
    'div[contenteditable="true"]',
    'rich-textarea div[contenteditable="true"]',
    ".ql-editor",
    'textarea[aria-label]',
    "textarea",
    'div[role="textbox"]',
    '[data-placeholder]',
  ];

  console.log("=== プロンプト入力欄 ===");
  for (const sel of inputCandidates) {
    const els = await page.$$(sel);
    if (els.length > 0) {
      for (const el of els) {
        const tag = await el.evaluate((e) => e.tagName);
        const role = await el.getAttribute("role");
        const ariaLabel = await el.getAttribute("aria-label");
        const placeholder = await el.getAttribute("data-placeholder") || await el.getAttribute("placeholder");
        const classes = await el.getAttribute("class");
        console.log(`  FOUND: ${sel}`);
        console.log(`    tag=${tag} role=${role} aria-label="${ariaLabel}" placeholder="${placeholder}"`);
        console.log(`    class="${classes?.substring(0, 80)}"`);
      }
    }
  }

  // ボタンを探す
  console.log("\n=== ボタン類 ===");
  const buttons = await page.$$("button");
  for (const btn of buttons) {
    const ariaLabel = await btn.getAttribute("aria-label");
    const text = await btn.innerText().catch(() => "");
    const matTooltip = await btn.getAttribute("mattooltip");
    const dataTooltip = await btn.getAttribute("data-tooltip");
    const visible = await btn.isVisible();
    if (visible && (ariaLabel || text.trim())) {
      console.log(`  button: aria-label="${ariaLabel}" text="${text.trim().substring(0, 40)}" tooltip="${matTooltip || dataTooltip}"`);
    }
  }

  // 画像アップロード関連
  console.log("\n=== ファイル入力 ===");
  const fileInputs = await page.$$('input[type="file"]');
  console.log(`  input[type="file"]: ${fileInputs.length}個`);

  // スクリーンショット
  await page.screenshot({ path: "gemini_inspect.png" });
  console.log("\n📸 スクリーンショット保存: gemini_inspect.png");

  console.log("\n完了。ブラウザは開いたままです。");
}

main().catch(console.error);
