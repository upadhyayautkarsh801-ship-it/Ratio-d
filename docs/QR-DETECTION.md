# QR Phishing (Quishing) Detection for Ratio'd

Extension of [VedxntDev/Ratio-d](https://github.com/VedxntDev/Ratio-d) (MIT). Adds detection of malicious QR codes to the web console and the Gmail extension. Base project: privacy-first scam analyzer, no framework, no build step, no runtime dependencies.

## 1. Problem

Quishing is phishing delivered through a QR code. The malicious URL is inside an image, so text-based email filters cannot read it, and the victim scans it on a phone that is usually outside corporate protections. Ratio'd originally analysed only text (email/SMS). This work adds the QR path.

## 2. What was added (changes made)

| Area | Change |
|---|---|
| Website (`index.html`) | New "QR phish check" panel at the bottom: drop / paste / upload an image or use the camera; 4-step tracker (CAPTURE, DECODE, ANALYZE, VERDICT); result card with score, verdict, flags, next steps. |
| Styling (`styles.css`) | QR panel styles appended, using the project's existing neo-brutalist tokens. |
| Decoder (`js/qr.js`, `js/vendor/jsQR.js`) | Decode with the browser `BarcodeDetector` when available, else vendored jsQR. Multi-scale retry, white background fill for transparent PNGs, camera loop. |
| UI logic (`js/qr-ui.js`) | Wiring and rendering. All attacker-controlled text is written with `textContent` (no `innerHTML`); payloads are shown defanged and never as clickable links. |
| Analyzer (`server/rules/qr.js`) | New deterministic rule engine, `analyzeQr(payload)`. |
| API (`server/routes/qr.js`, `start.js`) | New `POST /analyze-qr`. `start.js` wraps the existing `server.js` handler, so `server.js` itself is not modified. |
| Gmail extension (`extension/qr-gmail.js`, `qr-core.js`, `jsQR.js`, manifest) | Scans images in the open email; shows a Shadow DOM banner only for suspicious / high-risk codes. |
| Tests / tools | `server/test-qr.js` (25 cases), `tools/eval-qr.js` (dataset evaluation), `tools/make-test-qrs.py` (sample QR PNGs), `install-qr.js` (one-shot patcher). |

Nothing in the upstream repository is modified; work lives in a fork/branch.

## 3. How it works

```
image / camera / Gmail <img>
   -> decode (BarcodeDetector -> jsQR fallback)          [browser]
   -> redact PII in query/fragment (existing Redactor)    [browser]
   -> POST /analyze-qr {payload}
   -> classify payload type -> rules -> score -> verdict  [server]
   -> render card / banner (defanged, textContent only)   [browser]
```

**Payload types handled:** http(s) URL, scheme-less URL, text containing a URL, `upi://pay`, `WIFI:`, `tel:`/`sms:`, `mailto:`, crypto URIs, vCard, and dangerous schemes (`javascript:`, `data:`, `file:`, `intent:`).

**Scoring:** points are summed and capped at 100. Any "severe" signal floors the score at 82. Verdict: `high_risk` >= 66, `suspicious` >= 35, else `safe` (same thresholds as the base project).

| Signal | Points |
|---|---|
| Brand in hostname on non-official domain / homoglyph (`paypa1`) / typosquat (Levenshtein) | 40 (severe) |
| Raw IP host | 35 (severe) |
| Punycode / IDN host | 30 (severe) |
| `user@host` trick | 30 (severe) |
| UPI pay request with refund/reward wording | 40 (severe) |
| Dangerous URI scheme | 70 (severe) |
| URL shortener / QR redirector (destination hidden) | 25 |
| Brand name in path/query of unrelated domain | 25 |
| Abused TLD (.xyz, .top, .icu, ...) | 20 |
| Open-redirect parameter | 20 |
| Free / anonymous hosting | 15 |
| Recipient email pre-filled in URL (plain or base64) | 15 |
| Login/PHP page inside CMS folder | 15 |
| Credential/payment keyword in path | 12 |
| Long random token | 12 |
| Non-https, odd port, deep subdomains, many hyphens, long URL | 5-10 each |

The destination is **never fetched or followed**. This keeps the tool safe and offline-capable, and it is also its main limitation (section 6).

## 4. Datasets

No model is trained; the engine is rules. Datasets were used to **evaluate** the rules.

| Role | Dataset | Details |
|---|---|---|
| Phishing (positive) | Phishing.Database "phishing-links-ACTIVE" (mitchellkrogza, GitHub) | ~789,000 community-maintained phishing URLs. Only `http(s)` lines used; 5,000 sampled (seed 42). Labels were not independently verified. |
| Benign (negative) | OpenDNS public top domains (opendns/public-domain-lists, GitHub) | 10,000 popular domains; 5,000 sampled and converted to `https://domain/`. |
| Unit / functional | 25 hand-written cases (12 malicious, 13 benign) + 7 generated QR PNGs | Written by the author of the extension, so they show the rules work as designed, not real-world accuracy. |

Recommended for further evaluation: OpenPhish feed, PhishTank, URLhaus, Tranco top-1M, PhiUSIIL Phishing URL Dataset (UCI).

## 5. Efficiency (measured)

Evaluation: `node tools/eval-qr.js --benign opendns-top-domains.txt --phish phishing-links-ACTIVE.txt --n 5000` (deterministic, seed 42; 5,000 phishing + 5,000 benign).

| Version | Recall | Precision | Specificity | TP / FN | TN / FP |
|---|---|---|---|---|---|
| First version | 7.0% | 83.8% | 98.6% | 352 / 4648 | 4932 / 68 |
| Final version | **12.7%** | **96.8%** | **99.6%** | 636 / 4364 | 4979 / 21 |

- **Speed:** about 17 microseconds per analysis in Node (100,000 runs of one URL). This excludes image decoding and network time.
- **Other checks:** 25 / 25 unit cases pass; all 7 generated sample QR images decode with jsQR and score as expected, except a bare `bit.ly` link, which scores 25 ("safe") because shortener destinations are not followed.

**How to read these numbers**
- Precision and specificity are high: when the tool flags a URL it is usually right, and it rarely flags popular sites.
- **Recall is low (about 13%).** Most URLs in real feeds are compromised legitimate sites, bare random domains, or free-hosted pages with nothing suspicious in the URL string itself. Static URL rules cannot see them.
- The benign set is easy (popular root domains). Several rules (official-domain lists, country domains, suffix handling) were adjusted after inspecting false positives from this same list, so specificity is optimistic. Real deep-link traffic will produce more false positives.
- The 25-case suite is not evidence of accuracy.

## 6. Limitations and future work

1. **Destination not resolved.** Next step: follow redirects server-side with SSRF protection, and query URLhaus / Google Safe Browsing / PhishTank lookups. This is the biggest available gain in recall.
2. **Static rules only.** Page content, certificates and domain age are not checked.
3. **Gmail:** images are proxied, so some cannot be read; attachments are not scanned.
4. **Domain parsing** uses a small suffix list, not the Public Suffix List.
5. **Brand list** is short (about 30 brands). Brand-independent signals matter more.
6. **Abuse of legitimate hosts** (Google Forms, Sites, GitHub Pages) is only weakly detected.
7. **Physical QR stickers:** no check for a code pasted over another.
8. Camera and Gmail integration were written and structurally tested; run them in your own browser to confirm before claiming they work end to end.

## 7. Run and reproduce

```
node install-qr.js          # patches index.html, styles.css, package.json, extension manifest
node server/test-qr.js      # 25 cases
node start.js               # http://localhost:3000, QR panel at the bottom
node tools/eval-qr.js --benign <domains.txt> --phish <urls.txt> --n 5000
python tools/make-test-qrs.py   # regenerate sample QR PNGs (pip install "qrcode[pil]")
```

## 8. References

1. VedxntDev, *Ratio'd: Scam Risk Analyzer & Defense System*, GitHub, MIT License. https://github.com/VedxntDev/Ratio-d
2. jsQR, pure JavaScript QR decoder, cozmo/jsQR, Apache-2.0. https://github.com/cozmo/jsQR
3. WICG, *Shape Detection API* (`BarcodeDetector`). https://wicg.github.io/shape-detection-api/
4. ISO/IEC 18004, *QR Code bar code symbology specification*.
5. M. Krogza, *Phishing.Database*, GitHub. https://github.com/mitchellkrogza/Phishing.Database
6. OpenDNS, *public-domain-lists*, GitHub. https://github.com/opendns/public-domain-lists
7. OpenPhish community feed (openphish.com); PhishTank (phishtank.org); URLhaus, abuse.ch (urlhaus.abuse.ch).
8. V. Le Pochat et al., *Tranco: A Research-Oriented Top Sites Ranking Hardened Against Manipulation*, NDSS 2019. https://tranco-list.eu
9. A. Prasad and S. Chandra, *PhiUSIIL: A diverse security profile empowered phishing URL detection framework*, Computers & Security, 2024 (UCI ML Repository).
10. V. I. Levenshtein, *Binary codes capable of correcting deletions, insertions, and reversals*, Soviet Physics Doklady, 1966.
11. IETF RFC 3986 (URI syntax); RFC 3492 (Punycode); Unicode UTS #39 (confusable characters).
12. NPCI, *UPI linking specifications* (`upi://pay` deep link parameters).

## 9. Credits

Built on Ratio'd by Vedant (VedxntDev), MIT License. The QR module, UI panel, tests and tools are additions in a separate fork/branch.
