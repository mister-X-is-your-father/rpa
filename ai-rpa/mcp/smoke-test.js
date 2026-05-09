// asus-1のplaywright-mcp経由でChromeを操作するスモークテスト
// 1) MCP接続 → 2) tools list 取得 → 3) Googleナビゲート → 4) snapshot

const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { SSEClientTransport } = require("@modelcontextprotocol/sdk/client/sse.js");

const URL_MCP = "https://asus-1.tail65add4.ts.net:8443/sse";

(async () => {
  console.log("[1] MCP接続:", URL_MCP);
  const transport = new SSEClientTransport(new URL(URL_MCP));
  const client = new Client({ name: "leo-smoke", version: "1.0.0" });
  await client.connect(transport);
  console.log("    ✓ Connected");

  console.log("[2] ツール一覧取得...");
  const tools = await client.listTools();
  console.log(`    ✓ ${tools.tools.length} tools available`);
  console.log("    " + tools.tools.slice(0, 6).map((t) => t.name).join(", "), "...");

  console.log("[3] browser_navigate https://www.google.com");
  await client.callTool({
    name: "browser_navigate",
    arguments: { url: "https://www.google.com" },
  });
  console.log("    ✓ navigated");

  console.log("[4] browser_snapshot (accessibility tree)");
  const snap = await client.callTool({ name: "browser_snapshot", arguments: {} });
  const txt = JSON.stringify(snap.content).substring(0, 400);
  console.log("    " + txt + "...");

  await client.close();
  console.log("\n[done] asus-1のChromeをleo側から完全制御確認");
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
