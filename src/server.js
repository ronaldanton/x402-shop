// x402-shop — MPP/x402 paywalled AI microservices
// Seller server. Accepts USDC (testnet now, mainnet-ready) per request.
import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

const PORT = process.env.PORT || 4021;
const PAY_TO = process.env.SELLER_ADDRESS;      // your receiving wallet
const FACILITATOR = process.env.FACILITATOR_URL || "https://x402.org/facilitator";
const NETWORK = process.env.PAYMENT_NETWORK || "eip155:84532"; // Base Sepolia
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const LEDGER_FILE = path.join(process.cwd(), "data", "ledger.json");

// ---------- Ledger ----------
let ledger = [];
try { ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, "utf8")); } catch { ledger = []; }
function record(entry) {
  ledger.push(entry);
  fs.mkdirSync(path.dirname(LEDGER_FILE), { recursive: true });
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2));
}

// ---------- Ollama compute ----------
async function ollamaChat(model, messages, maxTokens = 300) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false, options: { num_predict: maxTokens } }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.message?.content ?? "";
}

// ---------- App ----------
const app = express();
app.use(express.json({ limit: "2mb" }));

// Free routes first (no paywall): landing, discovery, dashboard
app.get("/", (req, res) => {
  res.type("html").send(indexPage());
});

app.get("/.well-known/x402", (req, res) => {
  // Bazaar-style discovery: machine-readable catalog of paid endpoints
  res.json({
    name: "x402-shop",
    description: "Pay-per-call AI microservices (x402 / MPP)",
    website: process.env.PUBLIC_URL || `http://localhost:${PORT}`,
    endpoints: [
      { path: "/v1/summarize", method: "POST", price: "$0.01", description: "AI text summarization — 250-word summary of any text up to 20k chars" },
      { path: "/v1/classify-insurance", method: "POST", price: "$0.02", description: "Insurance lead classifier — intent, urgency, line of business" },
      { path: "/v1/extract", method: "POST", price: "$0.03", description: "Structured field extraction — key-value pairs from emails, forms, documents" },
      { path: "/v1/insurance-analysis", method: "POST", price: "$0.10", description: "Full insurance analysis bundle — classification + extraction + summary" },
      { path: "/v1/code-review", method: "POST", price: "$0.05", description: "AI code review — bugs, security, performance, quality analysis" },
      { path: "/v1/sentiment", method: "POST", price: "$0.02", description: "Sentiment analysis — positive/negative/neutral with emotions and keywords" },
      { path: "/v1/translate", method: "POST", price: "$0.03", description: "Text translation — translate to any language" },
    ],
  });
});

app.get("/health", (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));
app.get("/stats", (req, res) => {
  const paid = ledger.filter(e => e.status === "paid");
  res.json({
    requests_paid: paid.length,
    gross_usd: paid.reduce((s, e) => s + (e.usd || 0), 0),
    by_service: paid.reduce((m, e) => (m[e.service] = (m[e.service] || 0) + (e.usd || 0), m), {}),
    last_20: ledger.slice(-20),
  });
});

// ---------- Payment middleware ----------
const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR });
app.use(
  paymentMiddleware(
    {
      "POST /v1/summarize": {
        accepts: [{ scheme: "exact", price: "$0.01", network: NETWORK, payTo: PAY_TO }],
        description: "AI text summarization — produces a 250-word summary of any text up to 20k characters",
        mimeType: "application/json",
        serviceName: "x402-shop Summarize",
        tags: ["summarize", "text", "AI", "x402"],
        extensions: {
          bazaar: {
            info: {
              input: { type: "http", method: "POST", body: { text: "string (200-20000 chars)" } },
              output: { type: "json", example: { summary: "string" } }
            }
          }
        }
      },
      "POST /v1/classify-insurance": {
        accepts: [{ scheme: "exact", price: "$0.02", network: NETWORK, payTo: PAY_TO }],
        description: "Insurance lead classifier — identifies intent, urgency, and line of business from customer messages",
        mimeType: "application/json",
        serviceName: "x402-shop Insurance Classifier",
        tags: ["insurance", "classify", "AI", "x402"],
        extensions: {
          bazaar: {
            info: {
              input: { type: "http", method: "POST", body: { text: "string (10-5000 chars)" } },
              output: { type: "json", example: { intent: "string", urgency: "string", lineOfBusiness: "string", confidence: 0.95 } }
            }
          }
        }
      },
      "POST /v1/extract": {
        accepts: [{ scheme: "exact", price: "$0.03", network: NETWORK, payTo: PAY_TO }],
        description: "Structured field extraction — pulls key-value pairs from emails, forms, and documents",
        mimeType: "application/json",
        serviceName: "x402-shop Field Extractor",
        tags: ["extract", "fields", "AI", "x402"],
        extensions: {
          bazaar: {
            info: {
              input: { type: "http", method: "POST", body: { text: "string (10-20000 chars)" } },
              output: { type: "json", example: { fields: { name: "string", date: "string" } } }
            }
          }
        }
      },
      "POST /v1/insurance-analysis": {
        accepts: [{ scheme: "exact", price: "$0.10", network: NETWORK, payTo: PAY_TO }],
        description: "Full insurance analysis bundle — classification + field extraction + summary in one call",
        mimeType: "application/json",
        serviceName: "x402-shop Full Analysis",
        tags: ["insurance", "analysis", "bundle", "AI", "x402"],
        extensions: {
          bazaar: {
            info: {
              input: { type: "http", method: "POST", body: { text: "string (10-20000 chars)" } },
              output: { type: "json", example: { classification: {}, extraction: {}, summary: "string" } }
            }
          }
        }
      },
      "POST /v1/code-review": {
        accepts: [{ scheme: "exact", price: "$0.05", network: NETWORK, payTo: PAY_TO }],
        description: "AI code review — bugs, security, performance, quality analysis",
        mimeType: "application/json",
        serviceName: "x402-shop Code Review",
        tags: ["code", "review", "AI", "x402", "security"],
        extensions: {
          bazaar: {
            info: {
              input: { type: "http", method: "POST", body: { code: "string (10-4000 chars)", language: "string (optional)" } },
              output: { type: "json", example: { review: { issues: [], suggestions: [], score: 85 } } }
            }
          }
        }
      },
      "POST /v1/sentiment": {
        accepts: [{ scheme: "exact", price: "$0.02", network: NETWORK, payTo: PAY_TO }],
        description: "Sentiment analysis — positive/negative/neutral with emotions and keywords",
        mimeType: "application/json",
        serviceName: "x402-shop Sentiment",
        tags: ["sentiment", "analysis", "AI", "x402", "nlp"],
        extensions: {
          bazaar: {
            info: {
              input: { type: "http", method: "POST", body: { text: "string (10-5000 chars)" } },
              output: { type: "json", example: { sentiment: "positive", confidence: 0.92, emotions: ["joy"], keywords: ["great"] } }
            }
          }
        }
      },
      "POST /v1/translate": {
        accepts: [{ scheme: "exact", price: "$0.03", network: NETWORK, payTo: PAY_TO }],
        description: "Text translation — translate to any language",
        mimeType: "application/json",
        serviceName: "x402-shop Translate",
        tags: ["translate", "language", "AI", "x402"],
        extensions: {
          bazaar: {
            info: {
              input: { type: "http", method: "POST", body: { text: "string (10-5000 chars)", targetLanguage: "string (default: Spanish)" } },
              output: { type: "json", example: { translation: "string", targetLanguage: "Spanish" } }
            }
          }
        }
      },
    },
    new x402ResourceServer(facilitatorClient).register(NETWORK, new ExactEvmScheme()),
  ),
);

// ---------- Paid services (behind the 402 paywall) ----------
// Debug: log what the middleware attaches to req
app.use("/v1", (req, res, next) => {
  if (req.method === "POST") {
    console.log(`[MW] ${req.method} ${req.path} | x402Payment=${JSON.stringify(req.x402Payment)?.slice(0,200)} | payment=${JSON.stringify(req.payment)?.slice(0,200)} | headers.x-payment=${req.headers["x-payment"]?.slice(0,80)}`);
  }
  next();
});

app.post("/v1/summarize", async (req, res) => {
  const { text } = req.body || {};
  if (!text || typeof text !== "string") return res.status(400).json({ error: "field 'text' required" });
  if (text.length > 20000) return res.status(400).json({ error: "text too long (max 20000 chars)" });
  try {
    const summary = await ollamaChat(process.env.MODEL_SUMMARIZE || "gemma3:1b", [
      { role: "system", content: "You are a precise summarizer. Produce a crisp summary of at most 250 words. Output only the summary." },
      { role: "user", content: text },
    ]);
    record({ ts: new Date().toISOString(), service: "summarize", status: "paid", usd: 0.01, payer: payerOf(req) });
    res.json({ summary, words: summary.split(/\s+/).length });
  } catch (e) {
    record({ ts: new Date().toISOString(), service: "summarize", status: "error", usd: 0, error: String(e).slice(0, 200) });
    res.status(502).json({ error: "upstream AI failed" });
  }
});

app.post("/v1/classify-insurance", async (req, res) => {
  const { text } = req.body || {};
  if (!text || typeof text !== "string") return res.status(400).json({ error: "field 'text' required" });
  try {
    const out = await ollamaChat(process.env.MODEL_CLASSIFY || "gemma3:1b", [
      { role: "system", content: 'Classify this insurance lead. Respond ONLY with JSON: {"intent":"quote_request|renewal|claim|complaint|other","urgency":"low|medium|high","line":"auto|home|life|health|commercial|other","confidence":0.0}' },
      { role: "user", content: text },
    ]);
    let parsed; try { parsed = JSON.parse(out.trim().replace(/^```(json)?|```$/g, "")); } catch { parsed = { raw: out }; }
    record({ ts: new Date().toISOString(), service: "classify-insurance", status: "paid", usd: 0.02, payer: payerOf(req) });
    res.json(parsed);
  } catch (e) {
    record({ ts: new Date().toISOString(), service: "classify-insurance", status: "error", usd: 0, error: String(e).slice(0, 200) });
    res.status(502).json({ error: "upstream AI failed" });
  }
});

app.post("/v1/extract", async (req, res) => {
  const { text, fields } = req.body || {};
  if (!text) return res.status(400).json({ error: "field 'text' required" });
  try {
    const want = Array.isArray(fields) && fields.length ? fields.join(", ") : "all key-value pairs";
    const out = await ollamaChat(process.env.MODEL_EXTRACT || "gemma4:31b-cloud", [
      { role: "system", content: `Extract structured fields (${want}) from the text. Respond ONLY with a JSON object of field->value.` },
      { role: "user", content: String(text).slice(0, 20000) },
    ]);
    let parsed; try { parsed = JSON.parse(out.trim().replace(/^```(json)?|```$/g, "")); } catch { parsed = { raw: out }; }
    record({ ts: new Date().toISOString(), service: "extract", status: "paid", usd: 0.03, payer: payerOf(req) });
    res.json(parsed);
  } catch (e) {
    record({ ts: new Date().toISOString(), service: "extract", status: "error", usd: 0, error: String(e).slice(0, 200) });
    res.status(502).json({ error: "upstream AI failed" });
  }
});

// ---------- PREMIUM: Full Insurance Analysis ($0.10) ----------
app.post("/v1/insurance-analysis", async (req, res) => {
  const { text } = req.body || {};
  if (!text || typeof text !== "string") return res.status(400).json({ error: "field 'text' required" });
  if (text.length > 20000) return res.status(400).json({ error: "text too long (max 20000 chars)" });
  try {
    const model = process.env.MODEL_CLASSIFY || "gemma4:31b-cloud";
    const [classifyOut, extractOut, summaryOut] = await Promise.all([
      ollamaChat(model, [
        { role: "system", content: 'Classify this insurance lead. Respond ONLY with JSON: {"intent":"quote_request|renewal|claim|complaint|other","urgency":"low|medium|high","line":"auto|home|life|health|commercial|other","confidence":0.0,"recommended_action":"..." }' },
        { role: "user", content: text },
      ]),
      ollamaChat(model, [
        { role: "system", content: "Extract all key-value fields from this text (names, dates, amounts, policies, vehicles, addresses, etc). Respond ONLY with a JSON object." },
        { role: "user", content: text.slice(0, 20000) },
      ]),
      ollamaChat(model, [
        { role: "system", content: "Summarize this insurance communication in 2-3 sentences. Output only the summary." },
        { role: "user", content: text },
      ]),
    ]);
    let classification; try { classification = JSON.parse(classifyOut.trim().replace(/^```(json)?|```$/g, "")); } catch { classification = { raw: classifyOut }; }
    let extracted; try { extracted = JSON.parse(extractOut.trim().replace(/^```(json)?|```$/g, "")); } catch { extracted = { raw: extractOut }; }
    record({ ts: new Date().toISOString(), service: "insurance-analysis", status: "paid", usd: 0.10, payer: payerOf(req) });
    res.json({
      classification,
      extracted_fields: extracted,
      summary: summaryOut.trim(),
      confidence: classification.confidence || 0,
      recommended_action: classification.recommended_action || "review_manually",
    });
  } catch (e) {
    record({ ts: new Date().toISOString(), service: "insurance-analysis", status: "error", usd: 0, error: String(e).slice(0, 200) });
    res.status(502).json({ error: "upstream AI failed" });
  }
});

// ---------- NEW: Code Review ($0.05) ----------
app.post("/v1/code-review", async (req, res) => {
  const { code, language } = req.body || {};
  if (!code || typeof code !== "string") return res.status(400).json({ error: "field 'code' required" });
  if (code.length < 10) return res.status(400).json({ error: "code too short (min 10 chars)" });
  try {
    const out = await ollamaChat(process.env.MODEL_CODE || "gemma4:31b-cloud", [
      { role: "system", content: `You are an expert code reviewer. Review this ${language || 'code'} for bugs, security issues, performance problems, and code quality. Be concise and specific. Format as JSON: {"issues": [...], "suggestions": [...], "score": 0-100}` },
      { role: "user", content: code.slice(0, 4000) },
    ]);
    let parsed; try { parsed = JSON.parse(out.trim().replace(/^```(json)?|```$/g, "")); } catch { parsed = { raw: out }; }
    record({ ts: new Date().toISOString(), service: "code-review", status: "paid", usd: 0.05, payer: payerOf(req) });
    res.json({ review: parsed, language: language || "auto-detected" });
  } catch (e) {
    record({ ts: new Date().toISOString(), service: "code-review", status: "error", usd: 0, error: String(e).slice(0, 200) });
    res.status(502).json({ error: "upstream AI failed" });
  }
});

// ---------- NEW: Sentiment Analysis ($0.02) ----------
app.post("/v1/sentiment", async (req, res) => {
  const { text } = req.body || {};
  if (!text || typeof text !== "string") return res.status(400).json({ error: "field 'text' required" });
  try {
    const out = await ollamaChat(process.env.MODEL_SENTIMENT || "gemma3:1b", [
      { role: "system", content: 'Analyze sentiment. Respond ONLY with JSON: {"sentiment":"positive|negative|neutral","confidence":0.0,"emotions":["anger","joy","sadness","fear","surprise"],"keywords":["..."]}' },
      { role: "user", content: text.slice(0, 5000) },
    ]);
    let parsed; try { parsed = JSON.parse(out.trim().replace(/^```(json)?|```$/g, "")); } catch { parsed = { raw: out }; }
    record({ ts: new Date().toISOString(), service: "sentiment", status: "paid", usd: 0.02, payer: payerOf(req) });
    res.json(parsed);
  } catch (e) {
    record({ ts: new Date().toISOString(), service: "sentiment", status: "error", usd: 0, error: String(e).slice(0, 200) });
    res.status(502).json({ error: "upstream AI failed" });
  }
});

// ---------- NEW: Translation ($0.03) ----------
app.post("/v1/translate", async (req, res) => {
  const { text, targetLanguage } = req.body || {};
  if (!text || typeof text !== "string") return res.status(400).json({ error: "field 'text' required" });
  const target = targetLanguage || "Spanish";
  try {
    const out = await ollamaChat(process.env.MODEL_TRANSLATE || "gemma4:31b-cloud", [
      { role: "system", content: `Translate the following text to ${target}. Output ONLY the translation, no explanations.` },
      { role: "user", content: text.slice(0, 5000) },
    ]);
    record({ ts: new Date().toISOString(), service: "translate", status: "paid", usd: 0.03, payer: payerOf(req) });
    res.json({ translation: out.trim(), targetLanguage: target });
  } catch (e) {
    record({ ts: new Date().toISOString(), service: "translate", status: "error", usd: 0, error: String(e).slice(0, 200) });
    res.status(502).json({ error: "upstream AI failed" });
  }
});

function payerOf(req) {
  // best-effort payer identification from middleware-verified payment
  const p = req.x402Payment || req.payment || null;
  return p?.payer || p?.from || p?.paymentPayload?.from || "unknown";
}

// ---------- Landing page ----------
function indexPage() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>x402-shop</title>
<style>
:root{color-scheme:dark}
body{font-family:ui-monospace,Menlo,monospace;background:#0b0e14;color:#d5d9e0;margin:0;padding:2rem;max-width:60rem;margin-inline:auto}
h1{color:#6ee7a0}h2{color:#9dc3ff;margin-top:2rem}
table{border-collapse:collapse;width:100%;margin-top:1rem}
td,th{border:1px solid #2a2f3a;padding:.5rem .75rem;text-align:left;font-size:.9rem}
th{background:#141925;color:#9dc3ff}
code{background:#141925;padding:.15rem .4rem;border-radius:4px}
a{color:#6ee7a0}
.stat{display:inline-block;background:#141925;border:1px solid #2a2f3a;padding:.75rem 1.25rem;border-radius:8px;margin:.25rem;min-width:9rem}
.stat b{display:block;font-size:1.4rem;color:#6ee7a0}
</style></head><body>
<h1>x402-shop</h1>
<p>Machine-payable AI microservices via the <b>402 Payment Required</b> protocol (x402 / MPP).
No accounts. No API keys. Pay per call in USDC.</p>
<div>
<div class="stat"><b>${"$" + (ledger.filter(e=>e.status==="paid").reduce((s,e)=>s+(e.usd||0),0)).toFixed(2)}</b>gross revenue</div>
<div class="stat"><b>${ledger.filter(e=>e.status==="paid").length}</b>paid requests</div>
<div class="stat"><b>7</b>services live</div>
</div>
<h2>Services &amp; pricing</h2>
<table><tr><th>Endpoint</th><th>Price</th><th>Description</th></tr>
<tr><td><code>POST /v1/summarize</code></td><td>$0.01</td><td>Summarize text (up to 20k chars)</td></tr>
<tr><td><code>POST /v1/classify-insurance</code></td><td>$0.02</td><td>Insurance lead classification (intent/urgency/line)</td></tr>
<tr><td><code>POST /v1/sentiment</code></td><td>$0.02</td><td>Sentiment analysis (positive/negative/neutral + emotions)</td></tr>
<tr><td><code>POST /v1/extract</code></td><td>$0.03</td><td>Structured field extraction</td></tr>
<tr><td><code>POST /v1/translate</code></td><td>$0.03</td><td>Text translation to any language</td></tr>
<tr><td><code>POST /v1/code-review</code></td><td>$0.05</td><td>AI code review (bugs/security/performance)</td></tr>
<tr style="background:#141925"><td><code>POST /v1/insurance-analysis</code></td><td><b>$0.10</b></td><td><b>⭐ FULL BUNDLE</b> — classification + extraction + summary</td></tr>
</table>
<h2>Pay like a machine</h2>
<pre><code># 1. Get the price (no payment attached)
curl -i -X POST https://YOUR-HOST/v1/summarize \\
  -H 'Content-Type: application/json' -d '{"text":"..."}'
# → HTTP 402 with payment instructions (accepts[])

# 2. Attach payment and retry (x402 client does this automatically)
npm i @x402/fetch viem
x402 fetch pays & returns your result. See README.</code></pre>
<h2>For AI agents</h2>
<p>Machine-readable catalog: <code>/.well-known/x402</code> · Stats: <code>/stats</code> · Health: <code>/health</code></p>
</body></html>`;
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`x402-shop listening on :${PORT}`);
  console.log(`  payTo:   ${PAY_TO}`);
  console.log(`  network: ${NETWORK} (Base Sepolia testnet)`);
  console.log(`  facilitator: ${FACILITATOR}`);
});
