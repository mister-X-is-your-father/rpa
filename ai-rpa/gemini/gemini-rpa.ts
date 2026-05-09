import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { config } from "./config";
import { prompts, fallbackPrompts, type PromptEntry } from "./prompts";

// ─── ユーティリティ ───

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function log(msg: string): void {
  console.log(`[${new Date().toLocaleTimeString("ja-JP")}] ${msg}`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureDir(dir: string): Promise<void> {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── ブラウザ起動 ───

async function launchBrowser(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  log("Chrome起動中 (ユーザープロファイル使用)...");

  // WSL環境からWindows側のChromeを使う
  // launchPersistentContextで既存のログインセッションを活用
  const context = await chromium.launchPersistentContext(
    config.chrome.userDataDir,
    {
      executablePath: config.chrome.executablePath,
      headless: false,
      channel: undefined,
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
  // browser objectはpersistentContextでは直接取得できないのでnull扱い
  return { browser: null as unknown as Browser, context, page };
}

// ─── Gemini操作 ───

async function navigateToGemini(page: Page): Promise<void> {
  log("Geminiに移動中...");
  await page.goto(config.gemini.url, { waitUntil: "domcontentloaded" });
  await sleep(2000);
  log("Geminiページ読み込み完了");
}

/**
 * プロンプト入力欄を見つけて入力する
 * Geminiの UIは変わりやすいので、複数のセレクタを試す
 */
async function typePrompt(page: Page, text: string): Promise<void> {
  log(`プロンプト入力中: "${text.substring(0, 50)}..."`);

  // Geminiの入力欄候補 (UIが変わったらここを更新)
  const inputSelectors = [
    'div[contenteditable="true"]',
    'rich-textarea div[contenteditable="true"]',
    ".ql-editor",
    'textarea[aria-label*="prompt"]',
    "textarea",
  ];

  for (const selector of inputSelectors) {
    try {
      const el = await page.waitForSelector(selector, { timeout: 3000 });
      if (el) {
        await el.click();
        await el.fill("");
        await page.keyboard.type(text, { delay: 30 });
        log("プロンプト入力完了");
        return;
      }
    } catch {
      // 次のセレクタを試す
    }
  }

  throw new Error("プロンプト入力欄が見つかりません。UIが変更された可能性があります。");
}

/**
 * 画像をアップロード（ある場合）
 */
async function uploadImage(page: Page, imagePath: string): Promise<void> {
  log(`画像アップロード中: ${imagePath}`);
  const absPath = path.resolve(imagePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`画像ファイルが見つかりません: ${absPath}`);
  }

  // ファイル入力を探す
  const fileInputSelectors = [
    'input[type="file"]',
    'input[accept*="image"]',
  ];

  for (const selector of fileInputSelectors) {
    try {
      const input = await page.waitForSelector(selector, { timeout: 3000 });
      if (input) {
        await input.setInputFiles(absPath);
        log("画像アップロード完了");
        await sleep(2000);
        return;
      }
    } catch {
      // 次を試す
    }
  }

  // ファイル入力が見つからない場合、アップロードボタンを探してクリック
  const uploadButtonSelectors = [
    'button[aria-label*="upload"]',
    'button[aria-label*="アップロード"]',
    'button[aria-label*="image"]',
    'button[aria-label*="画像"]',
  ];

  for (const selector of uploadButtonSelectors) {
    try {
      const btn = await page.waitForSelector(selector, { timeout: 2000 });
      if (btn) {
        await btn.click();
        await sleep(1000);
        // ファイルダイアログが出るはず → file input を再探索
        const input = await page.waitForSelector('input[type="file"]', { timeout: 5000 });
        if (input) {
          await input.setInputFiles(absPath);
          log("画像アップロード完了");
          await sleep(2000);
          return;
        }
      }
    } catch {
      // 次を試す
    }
  }

  log("⚠ 画像アップロード用の入力が見つかりません。手動でアップロードしてください。");
}

/**
 * 送信ボタンを押す
 */
async function submitPrompt(page: Page): Promise<void> {
  log("プロンプト送信中...");

  const submitSelectors = [
    'button[aria-label*="Send"]',
    'button[aria-label*="送信"]',
    'button[aria-label*="Submit"]',
    'button.send-button',
    'button[mattooltip*="Send"]',
  ];

  for (const selector of submitSelectors) {
    try {
      const btn = await page.waitForSelector(selector, { timeout: 2000 });
      if (btn && (await btn.isEnabled())) {
        await btn.click();
        log("送信完了");
        return;
      }
    } catch {
      // 次を試す
    }
  }

  // フォールバック: Enterキーで送信
  log("送信ボタンが見つからないため、Enterキーで送信");
  await page.keyboard.press("Enter");
}

/**
 * 画像生成の完了を待つ
 * ローディングが消えて画像が表示されるまで待機
 */
async function waitForGeneration(page: Page): Promise<boolean> {
  log("画像生成待機中...");

  // 生成中インジケータが消えるまで待つ (最大3分)
  const loadingSelectors = [
    ".loading-indicator",
    '[aria-label*="loading"]',
    ".thinking-indicator",
    'mat-progress-bar',
  ];

  // まず生成が始まるのを待つ
  await sleep(3000);

  // ローディングが消えるまで待機
  for (let i = 0; i < 60; i++) {
    let isLoading = false;
    for (const selector of loadingSelectors) {
      const el = await page.$(selector);
      if (el && (await el.isVisible())) {
        isLoading = true;
        break;
      }
    }

    if (!isLoading && i > 2) {
      // 画像が生成されたか確認
      const images = await page.$$('img[src*="blob:"], img[src*="data:"], img[src*="lh3.google"], img.generated-image');
      if (images.length > 0) {
        log("画像生成完了を検出");
        await sleep(1000);
        return true;
      }
    }

    // レスポンステキストの存在を確認（何かしら返答があるか）
    const responseAreas = await page.$$('.response-container, .model-response, [data-message-author-role="model"]');
    if (responseAreas.length > 0 && i > 5) {
      log("レスポンス検出 - 画像の有無を確認中...");
      await sleep(2000);
      return true;
    }

    await sleep(3000);
    if (i % 10 === 0) log(`  まだ生成中... (${i * 3}秒経過)`);
  }

  log("⚠ タイムアウト: 3分以内に生成が完了しませんでした");
  return false;
}

// ─── スクリーンショット & 品質確認 ───

async function takeScreenshot(page: Page, name: string): Promise<string> {
  await ensureDir(config.output.screenshotDir);
  const filename = `${name}_${timestamp()}.png`;
  const filepath = path.join(config.output.screenshotDir, filename);
  await page.screenshot({ path: filepath, fullPage: false });
  log(`スクリーンショット保存: ${filepath}`);
  return filepath;
}

/**
 * 品質確認 - ユーザーにターミナルで確認してもらう
 * 将来的にはVision APIで自動判定も可能
 */
async function checkQuality(screenshotPath: string): Promise<"ok" | "ng" | "skip"> {
  log(`\n📸 スクリーンショット: ${screenshotPath}`);
  log("品質を確認してください:");
  log("  [Enter] or 'ok'  → ダウンロードして次へ");
  log("  'ng'             → リトライ");
  log("  'skip'           → この画像をスキップ");

  return new Promise((resolve) => {
    process.stdout.write("\n判定 > ");
    process.stdin.resume();
    process.stdin.setEncoding("utf-8");
    process.stdin.once("data", (data: string) => {
      const input = data.trim().toLowerCase();
      if (input === "ng") resolve("ng");
      else if (input === "skip") resolve("skip");
      else resolve("ok");
    });
  });
}

// ─── ダウンロード ───

/**
 * 生成された画像をダウンロード
 */
async function downloadGeneratedImage(page: Page, promptName: string): Promise<string | null> {
  await ensureDir(config.output.dir);
  const filename = `${promptName}_${timestamp()}.png`;
  const filepath = path.join(config.output.dir, filename);

  // ダウンロードボタンを探す
  const downloadSelectors = [
    'button[aria-label*="Download"]',
    'button[aria-label*="ダウンロード"]',
    'button[aria-label*="download"]',
    'button[aria-label*="保存"]',
    '[data-tooltip*="Download"]',
  ];

  for (const selector of downloadSelectors) {
    try {
      const btn = await page.waitForSelector(selector, { timeout: 3000 });
      if (btn) {
        // ダウンロードイベントを待つ
        const [download] = await Promise.all([
          page.waitForEvent("download", { timeout: 10000 }),
          btn.click(),
        ]);
        await download.saveAs(filepath);
        log(`画像ダウンロード完了: ${filepath}`);
        return filepath;
      }
    } catch {
      // 次を試す
    }
  }

  // ダウンロードボタンが無い場合、画像を直接保存
  log("ダウンロードボタンが見つからないため、画像を直接取得...");
  try {
    const images = await page.$$('img[src*="blob:"], img[src*="data:"], img[src*="lh3.google"]');
    if (images.length > 0) {
      // 最後の画像（最新の生成結果）を取得
      const lastImg = images[images.length - 1];
      const src = await lastImg.getAttribute("src");

      if (src?.startsWith("data:")) {
        const base64Data = src.split(",")[1];
        fs.writeFileSync(filepath, Buffer.from(base64Data, "base64"));
        log(`画像保存完了 (base64): ${filepath}`);
        return filepath;
      } else if (src) {
        // URLから直接ダウンロード
        const response = await page.request.get(src);
        fs.writeFileSync(filepath, await response.body());
        log(`画像保存完了 (URL): ${filepath}`);
        return filepath;
      }
    }
  } catch (e) {
    log(`⚠ 画像の直接取得に失敗: ${e}`);
  }

  log("⚠ 画像のダウンロードに失敗しました");
  return null;
}

// ─── 履歴クリア ───

async function clearHistory(page: Page): Promise<void> {
  log("チャット履歴をクリア中...");

  // 新しいチャットを開始
  const newChatSelectors = [
    'button[aria-label*="New chat"]',
    'button[aria-label*="新しいチャット"]',
    'a[href*="/app"]',
    '.new-chat-button',
  ];

  for (const selector of newChatSelectors) {
    try {
      const btn = await page.waitForSelector(selector, { timeout: 3000 });
      if (btn) {
        await btn.click();
        await sleep(2000);
        log("新しいチャット開始");
        return;
      }
    } catch {
      // 次を試す
    }
  }

  // フォールバック: ページをリロード
  log("新しいチャットボタンが見つからないため、ページをリロード");
  await page.goto(config.gemini.url, { waitUntil: "domcontentloaded" });
  await sleep(3000);
}

// ─── メインワークフロー ───

async function processPrompt(
  page: Page,
  entry: PromptEntry,
  promptIndex: number
): Promise<void> {
  log(`\n${"=".repeat(60)}`);
  log(`📝 プロンプト ${promptIndex + 1}: ${entry.name}`);
  log(`${"=".repeat(60)}`);

  let historyRetries = 0;
  let currentPrompt = entry.prompt;

  while (historyRetries <= config.retry.maxHistoryRetries) {
    let retryCount = 0;
    const fallbacks = fallbackPrompts[entry.name] || [];

    while (retryCount <= config.retry.maxRetries) {
      // 画像アップロード（あれば）
      if (entry.imagePath) {
        await uploadImage(page, entry.imagePath);
      }

      // プロンプト入力 & 送信
      await typePrompt(page, currentPrompt);
      await submitPrompt(page);

      // 生成完了待ち
      const generated = await waitForGeneration(page);
      if (!generated) {
        log("生成に失敗。リトライします...");
        retryCount++;
        continue;
      }

      // スクリーンショット撮影
      const ssPath = await takeScreenshot(page, `${entry.name}_attempt${retryCount}`);

      // 品質確認
      const result = await checkQuality(ssPath);

      if (result === "ok") {
        // ダウンロード
        const dlPath = await downloadGeneratedImage(page, entry.name);
        if (dlPath) {
          log(`✅ 完了: ${entry.name} → ${dlPath}`);
        }
        return; // 成功、次のプロンプトへ
      }

      if (result === "skip") {
        log(`⏭ スキップ: ${entry.name}`);
        return;
      }

      // NG → リトライ
      retryCount++;
      if (retryCount <= config.retry.maxRetries) {
        // フォールバックプロンプトがあれば使う
        if (fallbacks.length > 0 && retryCount <= fallbacks.length) {
          currentPrompt = fallbacks[retryCount - 1];
          log(`プロンプト変更: "${currentPrompt.substring(0, 50)}..."`);
        } else {
          log(`同じプロンプトでリトライ (${retryCount}/${config.retry.maxRetries})`);
        }
      }
    }

    // リトライ上限到達 → 履歴クリアして再挑戦
    historyRetries++;
    if (historyRetries <= config.retry.maxHistoryRetries) {
      log(`\n🔄 履歴クリアして再挑戦 (${historyRetries}/${config.retry.maxHistoryRetries})`);
      await clearHistory(page);
      currentPrompt = entry.prompt; // 元のプロンプトに戻す
    }
  }

  log(`❌ ${entry.name}: 全リトライ失敗。スキップします。`);
}

// ─── エントリポイント ───

async function main(): Promise<void> {
  log("🚀 Gemini RPA 開始");

  await ensureDir(config.output.dir);
  await ensureDir(config.output.screenshotDir);

  const { context, page } = await launchBrowser();

  try {
    await navigateToGemini(page);

    // 手動ログイン待ち（必要な場合）
    log("Geminiが表示されるまで待機中...");
    log("※ ログインが必要な場合は手動でログインしてください");
    await sleep(3000);

    // 各プロンプトを処理
    for (let i = 0; i < prompts.length; i++) {
      await processPrompt(page, prompts[i], i);
    }

    log("\n🎉 全プロンプト処理完了!");
  } catch (e) {
    log(`❌ エラー発生: ${e}`);
    await takeScreenshot(page, "error");
  } finally {
    log("ブラウザを閉じますか？ [Enter]で閉じる / Ctrl+Cで開いたまま終了");
    await new Promise<void>((resolve) => {
      process.stdin.resume();
      process.stdin.once("data", () => resolve());
    });
    await context.close();
  }
}

main().catch(console.error);
