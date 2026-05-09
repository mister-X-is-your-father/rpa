// RPA Server - WSL側で動く。agentからの接続を受け付ける
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 9444;
let pendingCommand = null;
let pendingResolve = null;
let lastResult = null;

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Agent polls for commands
  if (req.method === "GET" && req.url === "/poll") {
    if (pendingCommand) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(pendingCommand));
      pendingCommand = null;
    } else {
      res.writeHead(204);
      res.end();
    }
    return;
  }

  // Agent posts results
  if (req.method === "POST" && req.url === "/result") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        lastResult = JSON.parse(body);
      } catch {
        lastResult = { raw: body };
      }
      if (pendingResolve) {
        pendingResolve(lastResult);
        pendingResolve = null;
      }
      // Save screenshot if present
      if (lastResult.result && lastResult.result.base64) {
        const ssDir = path.join(__dirname, "screenshots");
        if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });
        const ssPath = path.join(ssDir, `screenshot_${Date.now()}.png`);
        fs.writeFileSync(ssPath, Buffer.from(lastResult.result.base64, "base64"));
        lastResult.screenshotPath = ssPath;
        console.log(`📸 Screenshot saved: ${ssPath}`);
      }
      res.writeHead(200);
      res.end("ok");
    });
    return;
  }

  // CLI sends commands
  if (req.method === "POST" && req.url === "/command") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const cmd = JSON.parse(body);
      pendingCommand = cmd;
      console.log(`📤 Command queued: ${cmd.action}`);

      // Wait for result with timeout
      const timeout = cmd.action === "screenshot" ? 30000 : 60000;
      new Promise((resolve) => {
        pendingResolve = resolve;
        setTimeout(() => resolve({ error: "timeout" }), timeout);
      }).then((result) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      });
    });
    return;
  }

  // Get last result
  if (req.method === "GET" && req.url === "/result") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(lastResult || { empty: true }));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🖥️  RPA Server 起動: http://0.0.0.0:${PORT}`);
  console.log("Agent からの接続を待機中...\n");
});
