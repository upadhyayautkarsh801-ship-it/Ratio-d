"use strict";
/* Run instead of `npm start`: node start.js
   Wraps the existing server.js handler and adds POST /analyze-qr. server.js is not edited. */
const http = require("http");
const mod = require("./server.js");
const handler = typeof mod === "function" ? mod : (mod && (mod.handler || mod.default));
if (typeof handler !== "function") { console.error("server.js does not export a request handler"); process.exit(1); }
const { handleQr } = require("./server/routes/qr");
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  const p = (req.url || "").split("?")[0];
  if (p === "/analyze-qr") {
    if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
    if (req.method === "POST") {
      let b = "", big = false;
      req.on("data", c => { b += c; if (b.length > 20000) { big = true; req.destroy(); } });
      req.on("end", () => {
        if (big) return;
        let body = {}; try { body = JSON.parse(b || "{}"); } catch (e) { /* bad json -> 400 below */ }
        const r = handleQr(body);
        res.writeHead(r.status, Object.assign({ "Content-Type": "application/json" }, CORS));
        res.end(JSON.stringify(r.json));
      });
      return;
    }
  }
  return handler(req, res);
}).listen(PORT, () => console.log("Ratio'd + QR on http://localhost:" + PORT));
