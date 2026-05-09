// SSH経由でユーザーPC上のChromeを操作するスクリプト
// 引数: JSON文字列でコマンドを受け取る
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const cmd = JSON.parse(process.argv[2] || '{"action":"pages"}');

(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0];
  const page = context.pages()[0] || (await context.newPage());

  let result;
  switch (cmd.action) {
    case "pages":
      result = context.pages().map(p => p.url());
      break;

    case "goto":
      await page.goto(cmd.url, { waitUntil: "domcontentloaded" });
      await new Promise(r => setTimeout(r, cmd.wait || 3000));
      result = { url: page.url() };
      break;

    case "screenshot":
      await page.screenshot({ path: cmd.path || "C:\\Users\\ikimo\\rpa\\screenshot.png" });
      result = { saved: cmd.path || "C:\\Users\\ikimo\\rpa\\screenshot.png" };
      break;

    case "type":
      const el = await page.waitForSelector(cmd.selector, { timeout: 5000 });
      await el.click();
      if (cmd.clear) await el.fill("");
      await page.keyboard.type(cmd.text, { delay: cmd.delay || 30 });
      result = { typed: cmd.text.substring(0, 50) };
      break;

    case "click":
      await page.waitForSelector(cmd.selector, { timeout: 5000 }).then(b => b.click());
      await new Promise(r => setTimeout(r, cmd.wait || 1000));
      result = { clicked: cmd.selector };
      break;

    case "upload":
      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 10000 }),
        (async () => {
          const btn = await page.waitForSelector('button[aria-label="[ファイルをアップロード] メニューを開く"]', { timeout: 5000 });
          await btn.click();
          await new Promise(r => setTimeout(r, 500));
          const mi = await page.waitForSelector('text=ファイルをアップロード', { timeout: 3000 });
          await mi.click();
        })(),
      ]);
      await fileChooser.setFiles(cmd.path);
      await new Promise(r => setTimeout(r, 3000));
      result = { uploaded: cmd.path };
      break;

    case "send":
      await page.waitForSelector('button[aria-label="送信"], button.send-button', { timeout: 5000 }).then(b => b.click());
      await new Promise(r => setTimeout(r, 2000));
      result = { sent: true };
      break;

    case "stop":
      try {
        await page.waitForSelector('button[aria-label="回答を停止"]', { timeout: 3000 }).then(b => b.click());
        result = { stopped: true };
      } catch { result = { stopped: false, reason: "no stop button" }; }
      break;

    case "waitDone":
      // Wait until the stop button disappears (generation complete)
      const timeout = cmd.timeout || 180000;
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const stopBtn = await page.$('button[aria-label="回答を停止"]');
        if (!stopBtn) { result = { done: true, elapsed: Date.now() - start }; break; }
        await new Promise(r => setTimeout(r, 2000));
      }
      if (!result) result = { done: false, timedOut: true };
      break;

    case "evaluate":
      result = await page.evaluate(cmd.code);
      break;

    case "inspect":
      const buttons = await page.$$("button");
      const btnInfo = [];
      for (const btn of buttons) {
        const ariaLabel = await btn.getAttribute("aria-label");
        const text = await btn.innerText().catch(() => "");
        const visible = await btn.isVisible();
        if (visible && (ariaLabel || text.trim()))
          btnInfo.push({ ariaLabel, text: text.trim().substring(0, 60) });
      }
      result = { buttons: btnInfo, url: page.url() };
      break;

    default:
      result = { error: "Unknown action: " + cmd.action };
  }

  console.log(JSON.stringify(result));
})().catch(e => console.log(JSON.stringify({ error: e.message })));
