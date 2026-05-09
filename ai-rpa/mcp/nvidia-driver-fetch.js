// NVIDIA Studio Driver for GeForce RTX 3060 Desktop, Windows 11 64bit
// 公式フォームを順次操作して最新ドライバーURL取得
const { chromium } = require("playwright");

(async () => {
  console.error("[1] Chrome CDP接続...");
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const context = browser.contexts()[0];
  const page = context.pages()[0] || (await context.newPage());

  console.error("[2] NVIDIA Driver検索 (en-us)...");
  await page.goto("https://www.nvidia.com/Download/index.aspx?lang=en-us", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  console.error("[3] Product Category = GeForce (1) 選択");
  await page.evaluate(() => {
    const s = document.querySelector("#manualSearch-0");
    s.value = "1";
    s.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(2000);

  // Series選択肢を確認、GeForce RTX 30 Seriesを探す
  const seriesOpts = await page.$$eval("#manualSearch-1 option", (opts) =>
    opts.map((o) => ({ v: o.value, t: o.text }))
  );
  console.error("Series options:", JSON.stringify(seriesOpts.filter((o) => o.t.match(/RTX 30|3060/i))));
  const rtx30 = seriesOpts.find((o) => /GeForce\s+RTX\s+30\s+Series/i.test(o.t) && !/Notebook/i.test(o.t));
  if (!rtx30) throw new Error("RTX 30 Series option not found");

  console.error(`[4] Series = ${rtx30.t} (${rtx30.v}) 選択`);
  await page.evaluate((v) => {
    const s = document.querySelector("#manualSearch-1");
    s.value = v;
    s.dispatchEvent(new Event("change", { bubbles: true }));
  }, rtx30.v);
  await page.waitForTimeout(2000);

  // Product選択
  const productOpts = await page.$$eval("#manualSearch-2 option", (opts) =>
    opts.map((o) => ({ v: o.value, t: o.text }))
  );
  const rtx3060 = productOpts.find((o) => /GeForce\s+RTX\s+3060$/i.test(o.t.trim()));
  if (!rtx3060) {
    console.error("Product options:", JSON.stringify(productOpts));
    throw new Error("RTX 3060 not found");
  }
  console.error(`[5] Product = ${rtx3060.t} (${rtx3060.v}) 選択`);
  await page.evaluate((v) => {
    const s = document.querySelector("#manualSearch-2");
    s.value = v;
    s.dispatchEvent(new Event("change", { bubbles: true }));
  }, rtx3060.v);
  await page.waitForTimeout(2000);

  // OS
  const osOpts = await page.$$eval("#manualSearch-3 option", (opts) =>
    opts.map((o) => ({ v: o.value, t: o.text }))
  );
  const win11 = osOpts.find((o) => /Windows 11/i.test(o.t));
  console.error(`[6] OS = ${win11.t} (${win11.v}) 選択`);
  await page.evaluate((v) => {
    const s = document.querySelector("#manualSearch-3");
    s.value = v;
    s.dispatchEvent(new Event("change", { bubbles: true }));
  }, win11.v);
  await page.waitForTimeout(2000);

  // Download Type (Studio Driver = SD, Game Ready = GR)
  const dtOpts = await page.$$eval("#manualSearch-5 option", (opts) =>
    opts.map((o) => ({ v: o.value, t: o.text }))
  );
  console.error("DT options:", JSON.stringify(dtOpts));
  const studio = dtOpts.find((o) => /Studio/i.test(o.t));
  if (studio) {
    console.error(`[7] DownloadType = ${studio.t} (${studio.v})`);
    await page.evaluate((v) => {
      const s = document.querySelector("#manualSearch-5");
      s.value = v;
      s.dispatchEvent(new Event("change", { bubbles: true }));
    }, studio.v);
    await page.waitForTimeout(1000);
  }

  // Search ボタン押下
  console.error("[8] Search クリック");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
    page.click('input[type="submit"][value*="Search"], input[name="searchBtn"], a:has-text("Search")'),
  ]).catch(() => {});
  await page.waitForTimeout(3000);

  console.error("[9] 検索結果取得");
  const result = await page.evaluate(() => ({
    url: window.location.href,
    title: document.title,
    bodySnippet: document.body.innerText.substring(0, 1500),
  }));
  console.log(JSON.stringify(result, null, 2));

  // 詳細リンク
  const detailLink = await page.$('a:has-text("View")');
  if (detailLink) {
    const href = await detailLink.getAttribute("href");
    console.error(`detail link: ${href}`);
  }
  // Direct download
  const dlLink = await page.$('a:has-text("Download")');
  if (dlLink) {
    const href = await dlLink.getAttribute("href");
    console.log("DOWNLOAD_LINK:", href);
  }

  await browser.close().catch(() => {});
  process.exit(0);
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
