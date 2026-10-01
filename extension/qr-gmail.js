/* Gmail: decode QR codes in (a) inline images in the message body and (b) image ATTACHMENTS,
   then show a Shadow DOM banner for suspicious / high-risk codes.
   Needs jsQR.js + qr-core.js loaded first. Debug lines start with [ratiod-qr] in the page console (F12). */
(function () {
  "use strict";
  if (!window.QrScan) return;
  window.QrScan.setEndpoints(["http://127.0.0.1:3000/analyze-qr", "https://ratio-d.vercel.app/analyze-qr"]);
  var seenEl = new WeakSet(), seenUrl = new Set(), VERD = ["safe", "suspicious", "high_risk"];
  var log = function () { try { console.debug.apply(console, ["[ratiod-qr]"].concat([].slice.call(arguments))); } catch (e) { /* ignore */ } };

  function banner(anchor, res, label) {
    var v = VERD.indexOf(res.verdict) >= 0 ? res.verdict : "suspicious";
    if (v === "safe" || !anchor || !anchor.parentNode) return; // stay quiet on clean codes
    var host = document.createElement("div"), sh = host.attachShadow({ mode: "open" });
    var st = document.createElement("style");
    st.textContent = ".b{font:13px monospace;border:3px solid #121212;background:#F8F7F2;box-shadow:4px 4px 0 #121212;padding:10px;margin:8px 0}.h{font-weight:800;color:" + (v === "high_risk" ? "#EA3E2B" : "#E8720C") + "}code{display:block;word-break:break-all;margin:6px 0}";
    var b = document.createElement("div"); b.className = "b";
    var h = document.createElement("div"); h.className = "h"; h.textContent = "[ QR " + v.toUpperCase() + " ]  RISK SCORE: " + Number(res.score) + "/100  (" + label + ")";
    var c = document.createElement("code"); c.textContent = String(res.defanged);
    var ul = document.createElement("ul");
    (res.flags || []).slice(0, 6).forEach(function (f) { var li = document.createElement("li"); li.textContent = f.reason; ul.append(li); });
    b.append(h, c, ul); sh.append(st, b);
    anchor.parentNode.insertBefore(host, anchor);
  }

  async function handleBlob(blob, anchor, label) {
    var bmp = await createImageBitmap(blob);
    var codes = await window.QrScan.decodeBitmap(bmp);
    log(label, "decoded", codes.length, "code(s)");
    for (var j = 0; j < codes.length; j++) banner(anchor, await window.QrScan.analyze(codes[j]), label);
  }

  // (a) inline images in the body
  async function scanBody() {
    var body = document.querySelector(".a3s.aiL, .a3s, .ii.gt"); if (!body) return;
    var imgs = body.querySelectorAll("img");
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (seenEl.has(img) || !img.complete || img.naturalWidth < 80) continue;
      seenEl.add(img);
      try { await handleBlob(await (await fetch(img.src, { credentials: "include" })).blob(), img, "inline image"); }
      catch (e) { log("inline image failed:", e && e.message); }
    }
  }

  // (b) attachments: Gmail puts "mime:filename:url" in a download_url attribute on the attachment chip
  async function scanAttachments() {
    var els = document.querySelectorAll("[download_url]");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (seenEl.has(el)) continue;
      var m = /^([^:]+):(.*?):(https?:\/\/.+)$/.exec(el.getAttribute("download_url") || "");
      if (!m || m[1].indexOf("image/") !== 0) continue;
      seenEl.add(el);
      if (seenUrl.has(m[3])) continue; seenUrl.add(m[3]);
      var anchor = el.closest(".hq, .aQH") || el;
      try {
        var r = await fetch(m[3], { credentials: "include" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        await handleBlob(await r.blob(), anchor, "attachment " + m[2]);
      } catch (e) { log("attachment failed:", m[2], e && e.message); }
    }
    // fallback: attachment thumbnails (small, may not decode)
    var th = document.querySelectorAll(".aZo img, .aQH img");
    for (var k = 0; k < th.length; k++) {
      var t = th[k];
      if (seenEl.has(t) || !t.complete || t.naturalWidth < 60) continue;
      seenEl.add(t);
      try { await handleBlob(await (await fetch(t.src, { credentials: "include" })).blob(), t.closest(".hq, .aQH") || t, "attachment thumbnail"); }
      catch (e) { log("thumbnail failed:", e && e.message); }
    }
  }

  async function scan() { try { await scanBody(); await scanAttachments(); } catch (e) { log("scan error:", e && e.message); } }
  setInterval(scan, 2000);
  log("loaded");
})();
