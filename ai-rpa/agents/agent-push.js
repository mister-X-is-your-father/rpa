// RPA Agent (Push型) - ユーザーPC上で動き、WSL側のserverにポーリングして指示を取得・実行
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");

// WSLマシンのアドレス (Tailscale)
const SERVER = "http://100.97.178.43:9444";
const POLL_INTERVAL = 1000;

let browser = null;
let page = null;

async function connectChrome() {
  try {
    if (browser) {
      // 接続がまだ生きてるか確認
      try { browser.contexts(); } catch { browser = null; page = null; }
    }
    if (!browser) {
      browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
      browser.on("disconnected", () => { browser = null; page = null; console.log("⚠ Chrome切断、次回自動再接続"); });
      console.log("Chrome接続完了");
    }
    const context = browser.contexts()[0];
    page = context.pages()[0] || (await context.newPage());
    return page;
  } catch (e) {
    browser = null;
    page = null;
    throw new Error("Chrome接続失敗: " + e.message);
  }
}

function httpRequest(url, method, data) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = { hostname: u.hostname, port: u.port, path: u.pathname, method };
    if (data) options.headers = { "Content-Type": "application/json" };
    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("timeout")); });
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function executeCommand(cmd) {
  switch (cmd.action) {
    // ファイル操作系 (Chrome不要)
    case "listFiles": {
      const files = fs.readdirSync(cmd.dir);
      return { dir: cmd.dir, files: files.slice(0, cmd.limit || 100) };
    }
    case "readFile": {
      const data = fs.readFileSync(cmd.path).toString("base64");
      const ext = path.extname(cmd.path).toLowerCase();
      return { path: cmd.path, ext, size: data.length, base64: data };
    }
    case "writeFile": {
      const buf = Buffer.from(cmd.base64, "base64");
      fs.writeFileSync(cmd.path, buf);
      return { path: cmd.path, size: buf.length };
    }
    case "exec": {
      const result = execSync(cmd.command, {
        cwd: cmd.cwd || __dirname,
        timeout: cmd.timeout || 30000,
        encoding: "utf-8",
        shell: true,
      });
      return { stdout: result.substring(0, cmd.limit || 5000) };
    }
    case "selfUpdate": {
      execSync(`scp -P 5963 neo@100.97.178.43:/home/neo/rpa/agent-push.js "${path.join(__dirname, "agent-push.js")}"`, { encoding: "utf-8", shell: true });
      console.log("🔄 更新完了、再起動します...");
      const child = spawn("node", [path.join(__dirname, "agent-push.js")], { detached: true, stdio: "inherit" });
      child.unref();
      process.exit(0);
    }
    default:
      // Chrome操作系
      return await executeChromeCommand(cmd);
  }
}

async function executeChromeCommand(cmd) {
  const p = await connectChrome();

  switch (cmd.action) {
    case "goto":
      await p.goto(cmd.url, { waitUntil: "domcontentloaded" });
      await new Promise((r) => setTimeout(r, cmd.wait || 3000));
      return { url: p.url() };

    case "screenshot": {
      // ファイルに保存してパスだけ返す（base64転送でクラッシュ防止）
      const ssPath = path.join(__dirname, "latest_screenshot.png");
      await p.screenshot({ path: ssPath, fullPage: false });
      // 小さいサムネも作る（不要ならスキップ）
      return { saved: ssPath, size: fs.statSync(ssPath).size };
    }

    case "screenshotBase64": {
      // どうしてもbase64が必要な場合（小さいviewportで使う）
      const ssPath = path.join(__dirname, "latest_screenshot.png");
      await p.screenshot({ path: ssPath, fullPage: false });
      const data = fs.readFileSync(ssPath).toString("base64");
      return { base64: data };
    }

    case "inspect":
      return await inspectPage(p);

    case "type": {
      const el = await p.waitForSelector(cmd.selector, { timeout: 5000 });
      await el.click();
      if (cmd.clear) await el.fill("");
      await p.keyboard.type(cmd.text, { delay: cmd.delay || 30 });
      return { typed: cmd.text.substring(0, 50) };
    }

    case "click": {
      const btn = await p.waitForSelector(cmd.selector, { timeout: 5000 });
      await btn.click();
      await new Promise((r) => setTimeout(r, cmd.wait || 1000));
      return { clicked: cmd.selector };
    }

    case "wait":
      await new Promise((r) => setTimeout(r, cmd.ms || 3000));
      return { waited: cmd.ms || 3000 };

    case "waitForSelector":
      await p.waitForSelector(cmd.selector, { timeout: cmd.timeout || 30000 });
      return { found: cmd.selector };

    case "evaluate": {
      const result = await p.evaluate(new Function("return (" + cmd.code + ")"));
      return { result };
    }

    case "pages": {
      const ctx = browser.contexts()[0];
      const pages = ctx.pages().map((pg) => pg.url());
      return { pages };
    }

    case "download": {
      const imgs = await p.$$(cmd.selector || "img");
      const imgData = [];
      for (const img of imgs.slice(0, cmd.limit || 5)) {
        const src = await img.getAttribute("src");
        const alt = await img.getAttribute("alt");
        imgData.push({ src: (src || "").substring(0, 200), alt });
      }
      return { images: imgData };
    }

    case "html": {
      const html = await p.content();
      return { html: html.substring(0, cmd.limit || 10000) };
    }

    case "uploadToGemini": {
      const [fileChooser] = await Promise.all([
        p.waitForEvent("filechooser", { timeout: 10000 }),
        (async () => {
          const uploadBtn = await p.waitForSelector('button[aria-label="[ファイルをアップロード] メニューを開く"]', { timeout: 5000 });
          await uploadBtn.click();
          await new Promise((r) => setTimeout(r, 500));
          const menuItem = await p.waitForSelector('text=ファイルをアップロード', { timeout: 3000 });
          await menuItem.click();
        })(),
      ]);
      await fileChooser.setFiles(cmd.path);
      await new Promise((r) => setTimeout(r, 3000));
      return { uploaded: cmd.path };
    }

    case "setViewport": {
      await p.setViewportSize({ width: cmd.width || 800, height: cmd.height || 600 });
      return { width: cmd.width || 800, height: cmd.height || 600 };
    }

    default:
      return { error: "Unknown action: " + cmd.action };
  }
}

async function inspectPage(p) {
  const results = { inputs: [], buttons: [], fileInputs: 0, url: p.url() };
  const inputSels = ['div[contenteditable="true"]', 'div[role="textbox"]', 'textarea', '[data-placeholder]'];
  for (const sel of inputSels) {
    const els = await p.$$(sel);
    for (const el of els) {
      const tag = await el.evaluate((e) => e.tagName);
      const role = await el.getAttribute("role");
      const ariaLabel = await el.getAttribute("aria-label");
      const placeholder = await el.getAttribute("data-placeholder") || await el.getAttribute("placeholder");
      const classes = await el.getAttribute("class");
      results.inputs.push({ sel, tag, role, ariaLabel, placeholder, classes: (classes || "").substring(0, 100) });
    }
  }
  const buttons = await p.$$("button");
  for (const btn of buttons) {
    const ariaLabel = await btn.getAttribute("aria-label");
    const text = await btn.innerText().catch(() => "");
    const visible = await btn.isVisible();
    if (visible && (ariaLabel || text.trim())) {
      results.buttons.push({ ariaLabel, text: text.trim().substring(0, 60) });
    }
  }
  results.fileInputs = (await p.$$('input[type="file"]')).length;
  return results;
}

// メインループ - 絶対に落ちない
async function poll() {
  while (true) {
    try {
      const res = await httpRequest(`${SERVER}/poll`, "GET");
      if (res.status === 200 && res.body) {
        let cmd;
        try { cmd = JSON.parse(res.body); } catch { continue; }
        console.log(`📥 コマンド受信: ${cmd.action}`);
        try {
          const result = await executeCommand(cmd);
          console.log(`✅ 完了: ${cmd.action}`);
          await httpRequest(`${SERVER}/result`, "POST", { ok: true, result }).catch(() => {});
        } catch (e) {
          console.log(`❌ エラー: ${e.message}`);
          await httpRequest(`${SERVER}/result`, "POST", { ok: false, error: e.message }).catch(() => {});
        }
      }
    } catch (e) {
      // Server unreachable or any other error, just retry
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }
}

// uncaughtExceptionでも落ちない
process.on("uncaughtException", (e) => { console.log("⚠ 未処理例外（続行）:", e.message); });
process.on("unhandledRejection", (e) => { console.log("⚠ 未処理Promise拒否（続行）:", e); });

console.log(`\n🤖 RPA Agent (Push型) 起動`);
console.log(`WSL Server: ${SERVER}`);
console.log("コマンド待機中...\n");
poll();
