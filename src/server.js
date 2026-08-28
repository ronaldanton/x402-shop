// AgentPay — MPP/x402 paywalled AI microservices
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
app.set("trust proxy", 1); // cloudflared (127.0.0.1) → nginx → app; respect X-Forwarded-Proto so 402 resource URLs are https
app.use(express.json({ limit: "2mb" }));

// Free routes first (no paywall): landing, discovery, dashboard
app.use("/branding", express.static(path.join(process.cwd(), "branding")));
app.get("/", (req, res) => {
  res.type("html").send(indexPage());
});

app.get("/.well-known/x402", (req, res) => {
  // Bazaar-style discovery: machine-readable catalog of paid endpoints
  res.json({
    name: "AgentPay",
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

// ---------- Agent discovery endpoints (llms.txt, OpenAPI, robots, agent card) ----------
const PUBLIC_BASE = process.env.PUBLIC_URL || "https://agentpay.help";
const SERVICES = [
  { path: "/v1/summarize", price: "$0.01", summary: "AI text summarization — crisp 250-word summary of any text up to 20k chars", body: { text: "string (200-20000 chars, required)" }, out: { summary: "string", words: "number" } },
  { path: "/v1/classify-insurance", price: "$0.02", summary: "Insurance lead classifier — intent, urgency, line of business, confidence", body: { text: "string (10-5000 chars, required)" }, out: { intent: "quote_request|renewal|claim|complaint|other", urgency: "low|medium|high", line: "auto|home|life|health|commercial|other", confidence: "number" } },
  { path: "/v1/sentiment", price: "$0.02", summary: "Sentiment analysis — positive/negative/neutral with emotions and keywords", body: { text: "string (10-5000 chars, required)" }, out: { sentiment: "positive|negative|neutral", confidence: "number", emotions: "string[]", keywords: "string[]" } },
  { path: "/v1/extract", price: "$0.03", summary: "Structured field extraction — key-value pairs from emails, forms, documents", body: { text: "string (required)", fields: "string[] (optional — fields to extract)" }, out: { "<field>": "value (JSON object of extracted fields)" } },
  { path: "/v1/translate", price: "$0.03", summary: "Text translation — translate to any language", body: { text: "string (10-5000 chars, required)", targetLanguage: "string (optional, default Spanish)" }, out: { translation: "string", targetLanguage: "string" } },
  { path: "/v1/code-review", price: "$0.05", summary: "AI code review — bugs, security, performance, quality score", body: { code: "string (10-4000 chars, required)", language: "string (optional)" }, out: { review: { issues: "array", suggestions: "array", score: "number" }, language: "string" } },
  { path: "/v1/insurance-analysis", price: "$0.10", summary: "Full insurance analysis bundle — classification + field extraction + summary in one call", body: { text: "string (10-20000 chars, required)" }, out: { classification: "object", extracted_fields: "object", summary: "string", confidence: "number", recommended_action: "string" } },
];

app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(`User-agent: *\nAllow: /\n\nSitemap: ${PUBLIC_BASE}/sitemap.xml\n`);
});

app.get("/llms.txt", (req, res) => {
  const lines = [
    `# AgentPay`,
    ``,
    `> Pay-per-call AI microservices via the x402 protocol (HTTP 402 Payment Required). USDC on Base. No accounts, no API keys — wallet is auth.`,
    ``,
    `Base URL: ${PUBLIC_BASE}`,
    `Auth: x402 payment flow — any unauthenticated POST returns HTTP 402 with payment instructions; an x402 client pays and retries automatically.`,
    `Network: ${NETWORK} | Settlement: USDC | Facilitator: ${FACILITATOR}`,
    ``,
    `## Services`,
    ...SERVICES.map(s => `- \`POST ${s.path}\`: ${s.summary}. Price: ${s.price} per call. Body: ${JSON.stringify(s.body)}.`),
    ``,
    `## Machine discovery`,
    `- [x402 catalog](${PUBLIC_BASE}/.well-known/x402) — machine-readable endpoint catalog`,
    `- [OpenAPI spec](${PUBLIC_BASE}/openapi.json) — full OpenAPI 3.0`,
    `- [Agent card](${PUBLIC_BASE}/.well-known/agent.json)`,
    `- [Health](${PUBLIC_BASE}/health) — liveness probe`,
    `- [Stats](${PUBLIC_BASE}/stats) — live paid-request stats`,
    `- [GitHub](${PUBLIC_BASE}/github) — source code (Apache-2.0)`,
    ``,
    `## MCP`,
    `MCP server (stdio) that wraps all paid endpoints and handles x402 payment automatically: \`npx github:ronaldanton/x402-shop mcp-server.js\` (env: SHOP_URL=${PUBLIC_BASE}, BUYER_PRIVATE_KEY=<hex key>).`,
    ``,
    `## Example`,
    `\`curl -i -X POST ${PUBLIC_BASE}/v1/summarize -H 'Content-Type: application/json' -d '{"text":"..."}'\` → HTTP 402 with payment terms.`,
  ];
  res.type("text/plain").send(lines.join("\n"));
});

app.get("/openapi.json", (req, res) => {
  const paths = {};
  for (const s of SERVICES) {
    paths[s.path] = {
      post: {
        summary: s.summary,
        operationId: s.path.replace("/v1/", ""),
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: Object.fromEntries(Object.entries(s.body).map(([k, v]) => [k, { type: "string", description: v }])) } } },
        },
        responses: {
          "402": { description: "Payment Required — x402 payment instructions in response body" },
          "200": { description: "Service result (after x402 payment)", content: { "application/json": { schema: { type: "object", properties: { result: { type: "string", example: JSON.stringify(s.out) } } } } } },
        },
        "x-price": s.price,
        "x-payment": { scheme: "exact", network: NETWORK, currency: "USDC" },
        tags: ["agentpay"],
      },
    };
  }
  res.json({
    openapi: "3.0.3",
    info: { title: "AgentPay", version: "1.0.0", description: "Pay-per-call AI microservices via x402 (HTTP 402). USDC on Base. No accounts, no API keys.", "x-base-url": PUBLIC_BASE },
    servers: [{ url: PUBLIC_BASE }],
    paths,
  });
});

app.get("/.well-known/agent.json", (req, res) => {
  res.json({
    name: "AgentPay",
    description: "Pay-per-call AI microservices (summarize, classify, extract, translate, sentiment, code-review, insurance-analysis) via x402. USDC on Base, no accounts.",
    url: PUBLIC_BASE,
    version: "1.0.0",
    protocol: "x402",
    capabilities: SERVICES.map(s => ({ id: s.path.replace("/v1/", ""), endpoint: `${PUBLIC_BASE}${s.path}`, method: "POST", price_usd: parseFloat(s.price.replace("$", "")), description: s.summary })),
    discovery: { x402: `${PUBLIC_BASE}/.well-known/x402`, openapi: `${PUBLIC_BASE}/openapi.json`, llms: `${PUBLIC_BASE}/llms.txt` },
  });
});

app.get("/sitemap.xml", (req, res) => {
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${PUBLIC_BASE}/</loc></url>\n</urlset>`);
});

app.get("/github", (req, res) => res.redirect(301, "https://github.com/ronaldanton/x402-shop"));

// Official MCP registry discovery (registry.modelcontextprotocol.io convention)
app.use("/.well-known/mcp", express.static(path.join(process.cwd(), ".well-known", "mcp")));
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
        serviceName: "AgentPay Summarize",
        tags: ["summarize", "text", "AI", "x402"],
        extensions: {
          bazaar: {
            info: {
              input: { type: "http", method: "POST", body: { text: "string (200-20000 chars)" } },
              output: { type: "json", example: { summary: "string" } }
            },
            schema: {}
          }
        }
      },
      "POST /v1/classify-insurance": {
        accepts: [{ scheme: "exact", price: "$0.02", network: NETWORK, payTo: PAY_TO }],
        description: "Insurance lead classifier — identifies intent, urgency, and line of business from customer messages",
        mimeType: "application/json",
        serviceName: "AgentPay Insurance Classifier",
        tags: ["insurance", "classify", "AI", "x402"],
        extensions: {
          bazaar: {
            info: {
              input: { type: "http", method: "POST", body: { text: "string (10-5000 chars)" } },
              output: { type: "json", example: { intent: "string", urgency: "string", lineOfBusiness: "string", confidence: 0.95 } }
            },
            schema: {}
          }
        }
      },
      "POST /v1/extract": {
        accepts: [{ scheme: "exact", price: "$0.03", network: NETWORK, payTo: PAY_TO }],
        description: "Structured field extraction — pulls key-value pairs from emails, forms, and documents",
        mimeType: "application/json",
        serviceName: "AgentPay Field Extractor",
        tags: ["extract", "fields", "AI", "x402"],
        extensions: {
          bazaar: {
            info: {
              input: { type: "http", method: "POST", body: { text: "string (10-20000 chars)" } },
              output: { type: "json", example: { fields: { name: "string", date: "string" } } }
            },
            schema: {}
          }
        }
      },
      "POST /v1/insurance-analysis": {
        accepts: [{ scheme: "exact", price: "$0.10", network: NETWORK, payTo: PAY_TO }],
        description: "Full insurance analysis bundle — classification + field extraction + summary in one call",
        mimeType: "application/json",
        serviceName: "AgentPay Full Analysis",
        tags: ["insurance", "analysis", "bundle", "AI", "x402"],
        extensions: {
          bazaar: {
            info: {
              input: { type: "http", method: "POST", body: { text: "string (10-20000 chars)" } },
              output: { type: "json", example: { classification: {}, extraction: {}, summary: "string" } }
            },
            schema: {}
          }
        }
      },
      "POST /v1/code-review": {
        accepts: [{ scheme: "exact", price: "$0.05", network: NETWORK, payTo: PAY_TO }],
        description: "AI code review — bugs, security, performance, quality analysis",
        mimeType: "application/json",
        serviceName: "AgentPay Code Review",
        tags: ["code", "review", "AI", "x402", "security"],
        extensions: {
          bazaar: {
            info: {
              input: { type: "http", method: "POST", body: { code: "string (10-4000 chars)", language: "string (optional)" } },
              output: { type: "json", example: { review: { issues: [], suggestions: [], score: 85 } } }
            },
            schema: {}
          }
        }
      },
      "POST /v1/sentiment": {
        accepts: [{ scheme: "exact", price: "$0.02", network: NETWORK, payTo: PAY_TO }],
        description: "Sentiment analysis — positive/negative/neutral with emotions and keywords",
        mimeType: "application/json",
        serviceName: "AgentPay Sentiment",
        tags: ["sentiment", "analysis", "AI", "x402", "nlp"],
        extensions: {
          bazaar: {
            info: {
              input: { type: "http", method: "POST", body: { text: "string (10-5000 chars)" } },
              output: { type: "json", example: { sentiment: "positive", confidence: 0.92, emotions: ["joy"], keywords: ["great"] } }
            },
            schema: {}
          }
        }
      },
      "POST /v1/translate": {
        accepts: [{ scheme: "exact", price: "$0.03", network: NETWORK, payTo: PAY_TO }],
        description: "Text translation — translate to any language",
        mimeType: "application/json",
        serviceName: "AgentPay Translate",
        tags: ["translate", "language", "AI", "x402"],
        extensions: {
          bazaar: {
            info: {
              input: { type: "http", method: "POST", body: { text: "string (10-5000 chars)", targetLanguage: "string (default: Spanish)" } },
              output: { type: "json", example: { translation: "string", targetLanguage: "Spanish" } }
            },
            schema: {}
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
const INDEX_CSS = `:root{color-scheme:dark}
body{font-family:ui-monospace,Menlo,monospace;background:#0b0e14;color:#d5d9e0;margin:0;padding:2rem;max-width:65rem;margin-inline:auto}
.header-row{display:flex;align-items:center;gap:1.25rem;margin-bottom:1rem}
.logo-img{width:64px;height:64px;border-radius:0}
h1{color:#6ee7a0;font-size:2rem;margin:0}h2{color:#9dc3ff;margin-top:2rem}
h2 i{color:#6ee7a0;font-style:normal}
table{border-collapse:collapse;width:100%;margin-top:1rem}
td,th{border:1px solid #2a2f3a;padding:.5rem .75rem;text-align:left;font-size:.9rem}
th{background:#141925;color:#9dc3ff}
code{background:#141925;padding:.15rem .4rem;border-radius:4px}
a{color:#6ee7a0}.stat{display:inline-block;background:#141925;border:1px solid #2a2f3a;padding:.75rem 1.25rem;border-radius:8px;margin:.25rem;min-width:9rem}
.stat b{display:block;font-size:1.4rem;color:#6ee7a0}
.tagline{color:#9dc3ff;font-size:1.05rem;margin-bottom:1.5rem}
.cta{display:inline-block;background:#6ee7a0;color:#0b0e14;padding:.6rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:.5rem}
.cta:hover{background:#5bd48a}
.endpoints{display:grid;grid-template-columns:repeat(auto-fill,minmax(18rem,1fr));gap:.75rem;margin-top:1rem}
.card{background:#141925;border:1px solid #2a2f3a;border-radius:8px;padding:1rem}
.card .price{color:#6ee7a0;font-weight:bold;font-size:1.1rem}
.card .path{color:#9dc3ff;font-family:monospace;font-size:.85rem}
.card .desc{color:#a0a8b4;font-size:.85rem;margin-top:.35rem}
.tag{display:inline-block;background:#1a2040;color:#6ee7a0;padding:.1rem .5rem;border-radius:4px;font-size:.75rem;margin-right:.25rem}
.powered{text-align:center;color:#5a6270;font-size:.8rem;margin-top:3rem;border-top:1px solid #2a2f3a;padding-top:1.5rem}
.powered a{color:#6ee7a0}
pre{overflow-x:auto}
@media(max-width:600px){.endpoints{grid-template-columns:1fr}}`;

const SERVICES_HTML = [
  { path: "POST /v1/summarize", price: "$0.01", desc: "Summarize text (up to 20k chars)", tag: "text" },
  { path: "POST /v1/classify-insurance", price: "$0.02", desc: "Insurance lead classification (intent/urgency/line)", tag: "insurance" },
  { path: "POST /v1/sentiment", price: "$0.02", desc: "Sentiment analysis — positive/negative/neutral + emotions", tag: "nlp" },
  { path: "POST /v1/extract", price: "$0.03", desc: "Structured field extraction from emails, forms, docs", tag: "data" },
  { path: "POST /v1/translate", price: "$0.03", desc: "Text translation to any language", tag: "language" },
  { path: "POST /v1/code-review", price: "$0.05", desc: "AI code review — bugs, security, performance", tag: "dev" },
  { path: "POST /v1/insurance-analysis", price: "$0.10", desc: "⭐ FULL BUNDLE — classification + extraction + summary", tag: "bundle" },
].map(s => `<div class="card"><span class="price">${s.price}</span> <span class="path">${s.path}</span><div class="desc">${s.desc}</div><span class="tag">${s.tag}</span></div>`).join("");

function indexPage() {
  const gross = (ledger.filter(e=>e.status==="paid").reduce((s,e)=>s+(e.usd||0),0)).toFixed(2);
  const paid = ledger.filter(e=>e.status==="paid").length;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AgentPay — AI microservices via x402</title>
<meta name="description" content="Pay-per-call AI services via the 402 Payment Required protocol. No accounts, no API keys — just USDC on Base.">
<meta property="og:title" content="AgentPay — AI microservices via x402"><meta property="og:description" content="Pay-per-call AI services. No accounts. No API keys. USDC on Base.">
<meta property="og:image" content="/branding/final/og-image.png"><meta property="og:url" content="https://agentpay.help">
<link rel="icon" type="image/x-icon" href="/branding/final/favicon.ico">
<link rel="apple-touch-icon" href="/branding/final/apple-touch-icon.png">
<style>${INDEX_CSS}</style></head><body>
<div class="header-row"><img src="/branding/final/logo-clean-64.png" alt="AgentPay" class="logo-img"></div>
<p class="tagline">AI microservices behind the <b>402 Payment Required</b> protocol (x402 / MPP).<br>No accounts. No API keys. Pay per call in <b>USDC on Base</b>.</p>
<div><div class="stat"><b>$${gross}</b>gross revenue</div><div class="stat"><b>${paid}</b>paid requests</div><div class="stat"><b>7</b>services live</div><a href="/stats" class="cta">📊 Dashboard</a></div>
<h2><i>✦</i> Services &amp; Pricing</h2>
<div class="endpoints">${SERVICES_HTML}</div>
<h2><i>✦</i> Pay Like a Machine</h2>
<pre><code># 1. Get the price — send without payment
curl -i -X POST https://agentpay.help/v1/summarize \
  -H 'Content-Type: application/json' -d '{"text":"Your text here..."}'
# → HTTP 402 with payment instructions

# 2. Pay &amp; get result (x402 client handles it)
npm i @x402/fetch viem
x402 fetch pays &amp; returns your result. See README.</code></pre>
<h2><i>✦</i> For AI Agents</h2>
<p>Machine-readable: <code><a href="/llms.txt">llms.txt</a></code> · <code><a href="/.well-known/x402">x402 catalog</a></code> · <code><a href="/openapi.json">OpenAPI</a></code> · <code><a href="/.well-known/agent.json">agent.json</a></code> · Health: <code><a href="/health">/health</a></code> · <a href="https://github.com/ronaldanton/x402-shop">Source (Apache-2.0)</a></p>
<p class="powered">Powered by <a href="https://github.com/ronaldanton/x402-shop">x402-shop</a> · <a href="https://x402.org">x402 protocol</a> · Built on Base</p></body></html>`;

}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AgentPay listening on :${PORT}`);
  console.log(`  payTo:   ${PAY_TO}`);
  console.log(`  network: ${NETWORK} (${NETWORK === 'eip155:8453' ? 'Base mainnet' : 'Base Sepolia testnet'})`);
  console.log(`  facilitator: ${FACILITATOR}`);
});
