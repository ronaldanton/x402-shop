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

  // x402scan trending services
  { path: "/v1/token-safety", price: "$0.02", summary: "Token safety check - rug pull risk, honeypot detection, liquidity analysis", body: { address: "string (0x... contract address, required)", chain: "string (optional, default ethereum)" }, out: { safe: "boolean", risk_score: "number (0-100)", flags: "string[]", liquidity_usd: "number", pair_age_hours: "number", honeypot: "boolean" } },
  { path: "/v1/wallet-risk", price: "$0.02", summary: "Wallet address risk screening - OFAC sanctions, scam flags, tx patterns", body: { address: "string (0x... wallet address, required)", chain: "string (optional, default ethereum)" }, out: { risk_level: "low|medium|high|critical", ofac_sanctioned: "boolean", scam_flagged: "boolean", total_txns: "number", risk_factors: "string[]" } },
  { path: "/v1/web-scrape", price: "$0.01", summary: "Extract clean text from any URL - agents read web pages", body: { url: "string (required)", max_chars: "number (optional, default 5000)" }, out: { title: "string", content: "string", word_count: "number", published: "string" } },
  { path: "/v1/crypto-price", price: "$0.005", summary: "Real-time crypto prices - price, 24h change, market cap, volume", body: { symbols: "string[] (e.g. [bitcoin,ethereum,solana])", vs_currency: "string (optional, default usd)" }, out: { prices: "object (symbol -> {price, change_24h, market_cap, volume})" } },
  { path: "/v1/image-describe", price: "$0.03", summary: "Vision AI - describe any image from URL using multimodal model", body: { image_url: "string (required)", detail: "string (optional: brief|detailed)" }, out: { description: "string", objects: "string[]", text_found: "string" } },
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
    info: { title: "AgentPay", version: "1.0.0", description: "Pay-per-call AI microservices via x402 (HTTP 402). USDC on Base. No accounts, no API keys.", "x-base-url": PUBLIC_BASE, contact: { name: "Ronald Anton", email: "ronaldanton@gmail.com" } },
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
// MCP registry HTTP-domain auth: public keys for /.well-known/mcp-registry-auth
app.get("/.well-known/mcp-registry-auth", (req, res) => {
  res.type("application/json").send(fs.readFileSync(path.join(process.cwd(), ".well-known", "mcp-registry-auth"), "utf8"));
});
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
      "POST /v1/token-safety": {
        accepts: [{ scheme: "exact", price: "$0.02", network: NETWORK, payTo: PAY_TO }],
        description: "Token safety check - rug pull risk, honeypot detection, liquidity analysis",
        mimeType: "application/json",
        serviceName: "AgentPay Token Safety",
        tags: ["crypto", "safety", "defi", "x402"],
        extensions: { bazaar: { info: { input: { type: "http", method: "POST", body: { address: "0x... contract address", chain: "ethereum" } }, output: { type: "json", example: { safe: "boolean", risk_score: "number", flags: "string[]" } } }, schema: {} } }
      },
      "POST /v1/wallet-risk": {
        accepts: [{ scheme: "exact", price: "$0.02", network: NETWORK, payTo: PAY_TO }],
        description: "Wallet address risk screening - OFAC sanctions, scam flags, tx patterns",
        mimeType: "application/json",
        serviceName: "AgentPay Wallet Risk",
        tags: ["crypto", "compliance", "security", "x402"],
        extensions: { bazaar: { info: { input: { type: "http", method: "POST", body: { address: "0x... wallet address", chain: "ethereum" } }, output: { type: "json", example: { risk_level: "low|medium|high|critical", ofac_sanctioned: "boolean" } } }, schema: {} } }
      },
      "POST /v1/web-scrape": {
        accepts: [{ scheme: "exact", price: "$0.01", network: NETWORK, payTo: PAY_TO }],
        description: "Extract clean text from any URL - agents read web pages",
        mimeType: "application/json",
        serviceName: "AgentPay Web Scrape",
        tags: ["data", "scraping", "web", "x402"],
        extensions: { bazaar: { info: { input: { type: "http", method: "POST", body: { url: "https://...", max_chars: "number" } }, output: { type: "json", example: { title: "string", content: "string", word_count: "number" } } }, schema: {} } }
      },
      "POST /v1/crypto-price": {
        accepts: [{ scheme: "exact", price: "$0.005", network: NETWORK, payTo: PAY_TO }],
        description: "Real-time crypto prices - price, 24h change, market cap, volume",
        mimeType: "application/json",
        serviceName: "AgentPay Crypto Price",
        tags: ["crypto", "price", "market-data", "x402"],
        extensions: { bazaar: { info: { input: { type: "http", method: "POST", body: { symbols: "string[]", vs_currency: "usd" } }, output: { type: "json", example: { prices: "object" } } }, schema: {} } }
      },
      "POST /v1/image-describe": {
        accepts: [{ scheme: "exact", price: "$0.03", network: NETWORK, payTo: PAY_TO }],
        description: "Vision AI - describe any image from URL using multimodal model",
        mimeType: "application/json",
        serviceName: "AgentPay Image Describe",
        tags: ["vision", "image", "multimodal", "x402"],
        extensions: { bazaar: { info: { input: { type: "http", method: "POST", body: { image_url: "https://...", detail: "brief|detailed" } }, output: { type: "json", example: { description: "string", objects: "string[]" } } }, schema: {} } }
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
  { path: "POST /v1/token-safety", price: "$0.02", desc: "Token rug/honeypot check — liquidity, tax, pair age", tag: "crypto" },
  { path: "POST /v1/wallet-risk", price: "$0.02", desc: "Wallet risk screening — OFAC sanctions, scam flags", tag: "security" },
  { path: "POST /v1/web-scrape", price: "$0.01", desc: "Extract clean text from any URL — agents read web", tag: "data" },
  { path: "POST /v1/crypto-price", price: "$0.005", desc: "Real-time crypto prices — BTC, ETH, SOL + more", tag: "crypto" },
  { path: "POST /v1/image-describe", price: "$0.03", desc: "Vision AI — describe any image from URL", tag: "vision" },
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

// ========== NEW SERVICES: x402scan trending ==========

// 1. TOKEN SAFETY - rug pull detection using DexScreener
app.post("/v1/token-safety", async (req, res) => {
  try {
    const { address, chain = "ethereum" } = req.body;
    if (!address || !address.startsWith("0x")) return res.status(400).json({ error: "Valid 0x address required" });
    const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
    const dexData = await dexRes.json();
    const pairs = dexData.pairs || [];
    if (pairs.length === 0) {
      return res.json({ safe: false, risk_score: 95, flags: ["no_liquidity", "no_pairs_found"], liquidity_usd: 0, pair_age_hours: 0, honeypot: true });
    }
    const pair = pairs[0];
    const liquidity = pair.liquidity?.usd || 0;
    const pairAge = pair.pairCreatedAt ? (Date.now() - new Date(pair.pairCreatedAt).getTime()) / 3600000 : 0;
    const buyTax = pair.fees?.buy || 0;
    const sellTax = pair.fees?.sell || 0;
    let riskScore = 0;
    const flags = [];
    if (liquidity < 10000) { riskScore += 30; flags.push("low_liquidity"); }
    if (liquidity < 1000) { riskScore += 20; flags.push("very_low_liquidity"); }
    if (pairAge < 24) { riskScore += 25; flags.push("new_pair"); }
    if (pairAge < 1) { riskScore += 15; flags.push("brand_new"); }
    if (buyTax > 10) { riskScore += 20; flags.push("high_buy_tax"); }
    if (sellTax > 10) { riskScore += 25; flags.push("high_sell_tax"); }
    if (sellTax > 50) { riskScore += 15; flags.push("extreme_sell_tax"); }
    if (!pair.info?.websites?.length) { riskScore += 10; flags.push("no_website"); }
    if (!pair.info?.socials?.length) { riskScore += 10; flags.push("no_socials"); }
    const honeypot = sellTax > 90 || (sellTax > 50 && buyTax < 5);
    if (honeypot) { riskScore += 30; flags.push("likely_honeypot"); }
    riskScore = Math.min(100, riskScore);
    res.json({ safe: riskScore < 40, risk_score: riskScore, flags, liquidity_usd: liquidity, pair_age_hours: Math.round(pairAge), buy_tax: buyTax, sell_tax: sellTax, honeypot, verified: !!(pair.info?.websites?.length || pair.info?.socials?.length) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. WALLET RISK - address screening
app.post("/v1/wallet-risk", async (req, res) => {
  try {
    const { address, chain = "ethereum" } = req.body;
    if (!address || !address.startsWith("0x")) return res.status(400).json({ error: "Valid 0x address required" });
    let totalTxns = 0, firstSeen = null, lastActive = null;
    const riskFactors = [];
    try {
      const bsRes = await fetch(`https://blockscout.com/eth/mainnet/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&page=1&offset=5`);
      const data = await bsRes.json();
      const txns = data.result || [];
      totalTxns = txns.length;
      if (txns.length > 0) {
        firstSeen = new Date(parseInt(txns[txns.length - 1].timeStamp) * 1000).toISOString().split("T")[0];
        lastActive = new Date(parseInt(txns[0].timeStamp) * 1000).toISOString().split("T")[0];
      }
    } catch {}
    if (totalTxns === 0) riskFactors.push("no_transactions");
    if (firstSeen) {
      const ageDays = (Date.now() - new Date(firstSeen).getTime()) / 86400000;
      if (ageDays < 7) riskFactors.push("very_new_address");
      else if (ageDays < 30) riskFactors.push("new_address");
    }
    let ofacSanctioned = false;
    try {
      const ofacRes = await fetch("https://api.ofac-api.com/v4/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: address.toLowerCase() }) });
      if (ofacRes.ok) { const d = await ofacRes.json(); ofacSanctioned = (d.matches || []).length > 0; if (ofacSanctioned) riskFactors.push("ofac_sanctioned"); }
    } catch {}
    let riskLevel = "low";
    if (ofacSanctioned) riskLevel = "critical";
    else if (riskFactors.includes("very_new_address") && totalTxns < 3) riskLevel = "high";
    else if (riskFactors.length > 2) riskLevel = "medium";
    res.json({ risk_level: riskLevel, ofac_sanctioned: ofacSanctioned, scam_flagged: ofacSanctioned, total_txns: totalTxns, first_seen: firstSeen || "unknown", last_active: lastActive || "unknown", risk_factors: riskFactors });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. WEB SCRAPE - extract content from URL using Jina Reader
app.post("/v1/web-scrape", async (req, res) => {
  try {
    const { url, max_chars = 5000 } = req.body;
    if (!url || !url.startsWith("http")) return res.status(400).json({ error: "Valid HTTP(S) URL required" });
    const jinaRes = await fetch(`https://r.jina.ai/${url}`, { headers: { "Accept": "text/plain", "X-Return-Format": "text" }, signal: AbortSignal.timeout(15000) });
    if (!jinaRes.ok) return res.status(502).json({ error: `Upstream error: ${jinaRes.status}` });
    const fullText = await jinaRes.text();
    const lines = fullText.split("\n");
    const title = lines.find(l => l.startsWith("Title:"))?.replace("Title:", "").trim() || "";
    const published = lines.find(l => l.startsWith("Published Time:"))?.replace("Published Time:", "").trim() || "";
    const content = fullText.replace(/^Title:.*$/m, "").replace(/^URL Source:.*$/m, "").replace(/^Published Time:.*$/m, "").replace(/^Markdown Content:.*$/m, "").trim().slice(0, max_chars);
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    res.json({ title, content, word_count: wordCount, published });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. CRYPTO PRICE - real-time prices from CoinGecko
app.post("/v1/crypto-price", async (req, res) => {
  try {
    const { symbols = ["bitcoin"], vs_currency = "usd" } = req.body;
    if (!Array.isArray(symbols) || symbols.length === 0) return res.status(400).json({ error: "symbols array required" });
    if (symbols.length > 20) return res.status(400).json({ error: "Max 20 symbols per request" });
    const ids = symbols.map(s => s.toLowerCase().replace(/\s+/g, "-")).join(",");
    const cgRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=${vs_currency}&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`, { signal: AbortSignal.timeout(10000) });
    if (!cgRes.ok) return res.status(502).json({ error: `CoinGecko error: ${cgRes.status}` });
    const data = await cgRes.json();
    const prices = {};
    for (const [id, vals] of Object.entries(data)) {
      prices[id] = { price: vals[vs_currency], change_24h: vals[`${vs_currency}_24h_change`], market_cap: vals[`${vs_currency}_market_cap`], volume: vals[`${vs_currency}_24h_vol`] };
    }
    res.json({ prices });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 5. IMAGE DESCRIBE - vision AI from URL
app.post("/v1/image-describe", async (req, res) => {
  try {
    const { image_url, detail = "brief" } = req.body;
    if (!image_url) return res.status(400).json({ error: "image_url required" });
    const model = "moondream:latest";
    const prompt = detail === "detailed" ? "Describe this image in detail. List all visible objects, any text found, the mood/atmosphere, colors, and composition." : "Briefly describe this image in 2-3 sentences. List the main objects and any text visible.";
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, messages: [{ role: "user", content: prompt, images: [image_url] }], stream: false }), signal: AbortSignal.timeout(30000) });
    if (!ollamaRes.ok) return res.status(502).json({ error: `Vision model error: ${ollamaRes.status}` });
    const data = await ollamaRes.json();
    const description = data.message?.content || "Could not describe image";
    const objects = description.match(/[A-Z][a-z]+(?:\s+[a-z]+)*/g)?.slice(0, 10) || [];
    res.json({ description, objects: [...new Set(objects)], text_found: description.includes("text") ? "See description" : "None detected" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- catch-all 404 ----------
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AgentPay listening on :${PORT}`);
  console.log(`  payTo:   ${PAY_TO}`);
  console.log(`  network: ${NETWORK} (${NETWORK === 'eip155:8453' ? 'Base mainnet' : 'Base Sepolia testnet'})`);
  console.log(`  facilitator: ${FACILITATOR}`);
});
