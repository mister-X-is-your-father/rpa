// RPA Agent - ユーザーPC上で常駐し、WSL側からの指示を受けて実行する
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 9333;
let browser = null;
let page = null;

async function connectChrome() {
  if (!browser) {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
    console.log("Chrome接続完了");
  }
  const context = browser.contexts()[0];
  page = context.pages()[0] || (await context.newPage());
  return page;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const cmd = JSON.parse(body);
        const result = await executeCommand(cmd);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, result }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
  } else {
    res.writeHead(200);
    res.end("RPA Agent running");
  }
});

async function executeCommand(cmd) {
  const p = await connectChrome();

  switch (cmd.action) {
    case "goto":
      await p.goto(cmd.url, { waitUntil: "domcontentloaded" });
      await new Promise((r) => setTimeout(r, cmd.wait || 3000));
      return { url: p.url() };

    case "screenshot":
      const ssPath = path.join(__dirname, "screenshot.png");
      await p.screenshot({ path: ssPath, fullPage: cmd.fullPage || false });
      const data = fs.readFileSync(ssPath).toString("base64");
      return { base64: data };

    case "inspect":
      return await inspectPage(p);

    case "type":
      const el = await p.waitForSelector(cmd.selector, { timeout: 5000 });
      await el.click();
      if (cmd.clear) await el.fill("");
      await p.keyboard.type(cmd.text, { delay: cmd.delay || 30 });
      return { typed: cmd.text.substring(0, 50) };

    case "click":
      const btn = await p.waitForSelector(cmd.selector, { timeout: 5000 });
      await btn.click();
      await new Promise((r) => setTimeout(r, cmd.wait || 1000));
      return { clicked: cmd.selector };

    case "wait":
      await new Promise((r) => setTimeout(r, cmd.ms || 3000));
      return { waited: cmd.ms || 3000 };

    case "waitForSelector":
      await p.waitForSelector(cmd.selector, { timeout: cmd.timeout || 30000 });
      return { found: cmd.selector };

    case "evaluate":
      const result = await p.evaluate(cmd.code);
      return { result };

    case "pages":
      const ctx = browser.contexts()[0];
      const pages = ctx.pages().map((pg) => pg.url());
      return { pages };

    case "download":
      // 画像要素を探してbase64で返す
      const imgs = await p.$$(cmd.selector || "img");
      const imgData = [];
      for (const img of imgs.slice(0, cmd.limit || 5)) {
        const src = await img.getAttribute("src");
        const alt = await img.getAttribute("alt");
        imgData.push({ src: (src || "").substring(0, 200), alt });
      }
      return { images: imgData };

    case "html":
      const html = await p.content();
      return { html: html.substring(0, cmd.limit || 10000) };

    default:
      return { error: "Unknown action: " + cmd.action };
  }
}

async function inspectPage(p) {
  const results = { inputs: [], buttons: [], fileInputs: 0, url: p.url() };

  const inputSels = [
    'div[contenteditable="true"]', 'div[role="textbox"]',
    'textarea', '[data-placeholder]',
  ];
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

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🤖 RPA Agent 起動: http://0.0.0.0:${PORT}`);
  console.log("WSL側から操作できます。このウィンドウは閉じないでください。\n");
});
