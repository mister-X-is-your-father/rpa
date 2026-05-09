const { chromium } = require("playwright");
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const REMOTE = "neo@100.97.178.43";
const REMOTE_PORT = "5963";
const REMOTE_DIR = "/home/neo/rpa";

function sendToRemote(localPath, remotePath) {
  try {
    execSync(`scp -P ${REMOTE_PORT} "${localPath}" ${REMOTE}:${remotePath}`, { stdio: "inherit" });
  } catch (e) {
    console.log("⚠ ファイル転送失敗:", e.message);
  }
}

function sendResult(text) {
  const tmpFile = path.join(__dirname, "result.json");
  fs.writeFileSync(tmpFile, JSON.stringify({ timestamp: new Date().toISOString(), data: text }, null, 2));
  sendToRemote(tmpFile, `${REMOTE_DIR}/result.json`);
}

(async () => {
  console.log("Chrome (CDP) に接続中...");
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0];
  const page = context.pages()[0] || (await context.newPage());

  console.log("Geminiに移動中...");
  await page.goto("https://gemini.google.com/app", { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 5000));

  console.log("セレクタ調査中...\n");

  const results = { inputs: [], buttons: [], fileInputs: 0 };

  // プロンプト入力欄
  const inputCandidates = [
    'div[contenteditable="true"]',
    'rich-textarea div[contenteditable="true"]',
    ".ql-editor",
    'textarea[aria-label]',
    "textarea",
    'div[role="textbox"]',
    '[data-placeholder]',
  ];

  for (const sel of inputCandidates) {
    const els = await page.$$(sel);
    for (const el of els) {
      const tag = await el.evaluate((e) => e.tagName);
      const role = await el.getAttribute("role");
      const ariaLabel = await el.getAttribute("aria-label");
      const placeholder = await el.getAttribute("data-placeholder") || await el.getAttribute("placeholder");
      const classes = await el.getAttribute("class");
      results.inputs.push({ sel, tag, role, ariaLabel, placeholder, classes: (classes || "").substring(0, 100) });
    }
  }

  // ボタン
  const buttons = await page.$$("button");
  for (const btn of buttons) {
    const ariaLabel = await btn.getAttribute("aria-label");
    const text = await btn.innerText().catch(() => "");
    const matTooltip = await btn.getAttribute("mattooltip");
    const dataTooltip = await btn.getAttribute("data-tooltip");
    const visible = await btn.isVisible();
    if (visible && (ariaLabel || text.trim())) {
      results.buttons.push({ ariaLabel, text: text.trim().substring(0, 60), tooltip: matTooltip || dataTooltip });
    }
  }

  // ファイル入力
  const fileInputs = await page.$$('input[type="file"]');
  results.fileInputs = fileInputs.length;

  // スクショ
  const ssPath = path.join(__dirname, "gemini_inspect.png");
  await page.screenshot({ path: ssPath });

  // 結果をWSLに送信
  console.log("結果をWSLに送信中...");
  sendResult(results);
  sendToRemote(ssPath, `${REMOTE_DIR}/screenshots/gemini_inspect.png`);

  console.log("完了！WSL側で確認できます。");
})().catch(console.error);
