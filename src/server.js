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
import { mountMcp } from "./mcp-http.js";

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
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.message?.content ?? "";
}

// ---------- App ----------
const app = express();
app.set("trust proxy", 1); // cloudflared (127.0.0.1) → nginx → app; respect X-Forwarded-Proto so 402 resource URLs are https
app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Payment");
  res.header("Access-Control-Expose-Headers", "Payment-Required");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Free routes first (no paywall): landing, discovery, dashboard
app.use("/branding", express.static(path.join(process.cwd(), "branding")));
app.get("/branding/final/logo-512.png", (req, res) => res.redirect(301, "/branding/final/logo-clean-512.png"));
app.get("/", (req, res) => {
  res.type("html").send(indexPage());
});

app.get("/.well-known/x402", (req, res) => {
  // Bazaar-style discovery: machine-readable catalog of paid endpoints
  // Spec shape (x402scan / x402 Bazaar): version, resources, ownershipProofs
  res.json({
    // --- x402scan spec-required fields ---
    version: 1,
    resources: SERVICES.map(s => `${PUBLIC_BASE}${s.path}`),
    ownershipProofs: [PAY_TO],
    // --- rich catalog (extra, safe for unknown consumers) ---
    name: "AgentPay",
    description: "Pay-per-call AI microservices (x402 / MPP). USDC on Base, no accounts or API keys.",
    website: PUBLIC_BASE,
    specVersion: "1.0.0",
    protocol: "x402",
    network: NETWORK,
    currency: "USDC",
    facilitator: FACILITATOR,
    payTo: PAY_TO,
    endpoints: SERVICES.map(s => ({
      path: s.path,
      method: "POST",
      price: s.price,
      description: s.summary,
      body: s.body,
      output: s.out,
    })),
    discovery: {
      openapi: `${PUBLIC_BASE}/openapi.json`,
      llms: `${PUBLIC_BASE}/llms.txt`,
      agentCard: `${PUBLIC_BASE}/.well-known/agent.json`,
      mcp: `${PUBLIC_BASE}/.well-known/mcp.json`,
      health: `${PUBLIC_BASE}/health`,
      stats: `${PUBLIC_BASE}/stats`,
    },
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
  { path: "/v1/token-safety", price: "$0.02", summary: "Token safety check - rug pull risk, honeypot detection, liquidity analysis", body: { address: "string (0x... required)", chain: "string (optional)" }, out: { safe: "boolean", risk_score: "number", flags: "string[]", liquidity_usd: "number", honeypot: "boolean" } },
  { path: "/v1/wallet-risk", price: "$0.02", summary: "Wallet risk screening - OFAC sanctions, scam flags, tx patterns", body: { address: "string (0x... required)", chain: "string (optional)" }, out: { risk_level: "string", ofac_sanctioned: "boolean", total_txns: "number", risk_factors: "string[]" } },
  { path: "/v1/web-scrape", price: "$0.01", summary: "Extract clean text from any URL - agents read web pages", body: { url: "string (required)", max_chars: "number (optional)" }, out: { title: "string", content: "string", word_count: "number" } },
  { path: "/v1/crypto-price", price: "$0.005", summary: "Real-time crypto prices - BTC, ETH, SOL + more", body: { symbols: "string[]", vs_currency: "string (optional)" }, out: { prices: "object" } },
  { path: "/v1/image-describe", price: "$0.03", summary: "Vision AI - describe any image from URL", body: { image_url: "string (required)", detail: "string (optional)" }, out: { description: "string", objects: "string[]" } },
  { path: "/v1/defi-yields", price: "$0.01", summary: "DeFi yield data - APY, TVL, protocol info", body: { protocol: "string (optional)", chain: "string (optional)" }, out: { yields: "array" } },
  { path: "/v1/threat-intel", price: "$0.02", summary: "CVE/threat intelligence - vulnerability lookup, severity", body: { cve_id: "string", keyword: "string (optional)" }, out: { cve_id: "string", severity: "string", description: "string" } },
  { path: "/v1/sanctions-screen", price: "$0.02", summary: "OFAC/EU sanctions screening - entity check", body: { name: "string (required)", type: "string (optional)" }, out: { sanctioned: "boolean", lists: "string[]" } },
  { path: "/v1/market-intel", price: "$0.02", summary: "Macro/economic snapshot - GDP, inflation, rates", body: { country: "string (optional)" }, out: { country: "string", data: "object" } },
  { path: "/v1/on-chain-events", price: "$0.01", summary: "Decoded on-chain events - recent transfers", body: { address: "string (0x... required)", chain: "string (optional)" }, out: { events: "array" } },
  { path: "/v1/content-safety", price: "$0.02", summary: "Content security scan - PII, toxicity, bias", body: { text: "string (required)" }, out: { safe: "boolean", flags: "string[]" } },
  { path: "/v1/agent-reputation", price: "$0.01", summary: "Agent reputation score - endpoint trustworthiness", body: { endpoint_url: "string (required)" }, out: { score: "number", grade: "string" } },
  { path: "/v1/legal-lookup", price: "$0.03", summary: "Legal/regulatory lookup - company registration", body: { query: "string (required)", jurisdiction: "string (optional)" }, out: { results: "array" } },
  { path: "/v1/news-feed", price: "$0.005", summary: "Real-time news feed - headlines by topic", body: { query: "string (required)", limit: "number (optional)" }, out: { articles: "array" } },
  { path: "/v1/weather-data", price: "$0.005", summary: "Weather data - current conditions and forecast", body: { location: "string (required)", days: "number (optional)" }, out: { location: "string", current: "object", forecast: "array" } },
  { path: "/v1/web-search", price: "$0.01", summary: "Web search - top results for any query with title, url, snippet", body: { query: "string (required)", max_results: "number (optional, default 8)" }, out: { query: "string", results: "array of {title,url,snippet}", count: "number" } },
  { path: "/v1/memory", price: "$0.005", summary: "Persistent key-value memory scoped to your wallet - agents remember across runs", body: { action: "get|set|delete|list (required)", key: "string (required for get/set/delete)", value: "any (required for set)", namespace: "string (optional, default 'default')" }, out: { ok: "boolean", key: "string", namespace: "string", value: "any (on get)" } },
  { path: "/v1/geocode", price: "$0.005", summary: "Geocode place names to lat/lon; reverse geocode coordinates to addresses", body: { query: "string (required - place name or 'lat,lon')", reverse: "boolean (optional)" }, out: { results: "array of {name,country,lat,lon} (forward) | address+location (reverse)" } },
  { path: "/v1/eth-gas", price: "$0.003", summary: "Ethereum gas prices - rapid/fast/standard/slow in gwei plus ETH spot price", body: {}, out: { eth_usd: "number", gwei: "object {rapid,fast,standard,slow}", updated_at: "string" } },
  { path: "/v1/prediction-market", price: "$0.01", summary: "Polymarket prediction market odds - live probabilities for any topic", body: { query: "string (required)", limit: "number (optional, default 5)" }, out: { query: "string", events: "array of {title, end_date, markets:[{question,outcomes}]}" } },
  { path: "/v1/deep-research", price: "$0.25", summary: "PREMIUM deep research - multi-source web research into a cited markdown report", body: { topic: "string (required)", depth: "standard|deep (optional, default standard)" }, out: { report: "string (markdown with inline citations)", citations: "array of {id,url,title}", stats: "object" } },
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
    `Remote MCP server (Streamable HTTP, no install, no auth) exposing all ${SERVICES.length} services as MCP tools: POST ${PUBLIC_BASE}/mcp`,
    `Endpoint manifest: ${PUBLIC_BASE}/.well-known/mcp-endpoint.json | Discovery: ${PUBLIC_BASE}/.well-known/mcp.json`,
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
        // x402scan-required: pricing metadata + protocol declaration
        "x-payment-info": {
          protocols: ["x402"],
          scheme: "exact",
          network: NETWORK,
          currency: "USDC",
          price: { mode: "fixed", currency: "USD", amount: String(s.price).replace("$", "") },
          payTo: PAY_TO,
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        },
        tags: ["agentpay"],
      },
    };
  }
  res.json({
    openapi: "3.0.3",
    info: { title: "AgentPay", version: "1.0.0", description: "Pay-per-call AI microservices via x402 (HTTP 402). USDC on Base. No accounts, no API keys.", "x-base-url": PUBLIC_BASE, contact: { name: "Ronald Anton", email: "ronaldanton@gmail.com" } },
    servers: [{ url: PUBLIC_BASE }],
    // x402scan ownership proof (Base address that receives USDC)
    "x-discovery": {
      ownershipProofs: [PAY_TO],
      discovery: {
        x402: `${PUBLIC_BASE}/.well-known/x402`,
        llms: `${PUBLIC_BASE}/llms.txt`,
        mcp: `${PUBLIC_BASE}/.well-known/mcp.json`
      }
    },
    paths,
  });
});

app.get("/.well-known/mcp-registry-proof.txt", (req, res) => {
  res.type("text/plain").send("v=MCPv1; k=ed25519; p=MMf+QREFKS0+DA1XrIeVVc8OfceNXybINLTJ7GivUOk=");
});

app.get("/.well-known/x402list.txt", (req, res) => {
  res.type("text/plain").send("x402list-verify-6vneQmXfcwI1g9TvVpFR3wYx9dpCAvZ86FTKPkPum60");
});

app.get("/.well-known/agent.json", (req, res) => {
  res.json({
    name: "AgentPay",
    description: "Pay-per-call AI microservices via x402 — 28 services across web search, agent memory, geocoding, gas, prediction markets, AI reasoning, insurance, crypto/DeFi, security, compliance and data. USDC on Base, no accounts or API keys.",
    url: PUBLIC_BASE,
    version: "1.0.0",
    protocol: "x402",
    network: NETWORK,
    currency: "USDC",
    payTo: PAY_TO,
    contact: { name: "Ronald Anton", email: "ronaldanton@gmail.com" },
    capabilities: SERVICES.map(s => ({ id: s.path.replace("/v1/", ""), endpoint: `${PUBLIC_BASE}${s.path}`, method: "POST", price_usd: parseFloat(s.price.replace("$", "")), description: s.summary })),
    discovery: { x402: `${PUBLIC_BASE}/.well-known/x402`, openapi: `${PUBLIC_BASE}/openapi.json`, llms: `${PUBLIC_BASE}/llms.txt`, mcp: `${PUBLIC_BASE}/.well-known/mcp.json`, mcpEndpoint: `${PUBLIC_BASE}/.well-known/mcp-endpoint.json` },
    mcp: {
      transport: "streamable-http",
      url: `${PUBLIC_BASE}/mcp`,
      method: "POST",
      auth: "none",
      tools: SERVICES.length,
    },
  });
});

// MCP discovery manifest (non-registry, for agent crawlers)
app.get("/.well-known/mcp.json", (req, res) => {
  res.json({
    mcpServers: {
      agentpay: {
        // Remote server — connect over Streamable HTTP, no install required
        type: "streamable-http",
        url: `${PUBLIC_BASE}/mcp`,
        description: "AgentPay remote MCP server — 28 paid x402 tools, USDC on Base, no API keys.",
      },
      "agentpay-stdio": {
        // Local stdio server — pays from a local wallet
        command: "npx",
        args: ["-y", "github:ronaldanton/x402-shop", "mcp-server.js"],
        env: { SHOP_URL: PUBLIC_BASE, BUYER_PRIVATE_KEY: "<hex-private-key>" },
        description: "AgentPay MCP server (stdio) — wraps 28 paid x402 endpoints and settles USDC on Base automatically.",
      },
    },
  });
});

// AI plugin manifest (ChatGPT-plugin-era convention, still read by some directories)
app.get("/.well-known/ai-plugin.json", (req, res) => {
  res.json({
    schema_version: "v1",
    name_for_human: "AgentPay",
    name_for_model: "agentpay",
    description_for_human: "Pay-per-call AI microservices — summarize, classify, extract, translate, code review and 17 more, paid per call in USDC on Base.",
    description_for_model: "AgentPay exposes 22 AI/data microservices over HTTP. Every endpoint requires x402 payment (HTTP 402) settled in USDC on Base (eip155:8453). POST a JSON body to any /v1/* endpoint; you will receive a 402 with payment instructions, pay, then retry. No signup or API keys.",
    auth: { type: "none" },
    api: { type: "openapi", url: `${PUBLIC_BASE}/openapi.json`, is_user_authenticated: false },
    logo_url: `${PUBLIC_BASE}/logo.png`,
    contact_email: "ronaldanton@gmail.com",
    legal_info_url: `${PUBLIC_BASE}/`,
  });
});

// Security contact (RFC 9116)
app.get("/.well-known/security.txt", (req, res) => {
  const exp = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  res.type("text/plain").send(
    `Contact: mailto:ronaldanton@gmail.com\nExpires: ${exp}\nPreferred-Languages: en\nCanonical: ${PUBLIC_BASE}/.well-known/security.txt\n`
  );
});

app.get("/sitemap.xml", (req, res) => {
  const urls = [
    `<url><loc>${PUBLIC_BASE}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...SERVICES.map(s => `<url><loc>${PUBLIC_BASE}/#${s.path.replace("/v1/", "")}</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>`),
    `<url><loc>${PUBLIC_BASE}/llms.txt</loc><priority>0.8</priority></url>`,
    `<url><loc>${PUBLIC_BASE}/openapi.json</loc><priority>0.8</priority></url>`,
    `<url><loc>${PUBLIC_BASE}/.well-known/x402</loc><priority>0.8</priority></url>`,
  ];
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`);
});

app.get("/github", (req, res) => res.redirect(301, "https://github.com/ronaldanton/x402-shop"));

// ---------- Free demo endpoint (no paywall) ----------
const freeRateLimit = new Map(); // ip -> count
app.post("/v1/summarize-free", async (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const count = freeRateLimit.get(ip) || 0;
  if (count >= 3) return res.status(429).json({ error: "Free limit reached (3 per session). Use /v1/summarize with x402 payment." });
  const { text } = req.body || {};
  if (!text || typeof text !== "string") return res.status(400).json({ error: "field 'text' required" });
  if (text.length > 5000) return res.status(400).json({ error: "Demo limited to 5000 chars. Use /v1/summarize for full 20k." });
  try {
    const summary = await ollamaChat(process.env.MODEL_SUMMARIZE || "gemma3:1b", [
      { role: "system", content: "You are a precise summarizer. Produce a crisp summary of at most 100 words. Output only the summary." },
      { role: "user", content: text },
    ]);
    freeRateLimit.set(ip, count + 1);
    res.json({ summary, words: summary.split(/\s+/).length, demo: true, remaining: 3 - (count + 1) });
  } catch (e) {
    console.error("summarize-free error:", e.message, e.stack);
    res.status(502).json({ error: "upstream AI failed", detail: e.message });
  }
});

// Official MCP registry discovery (registry.modelcontextprotocol.io convention)
app.use("/.well-known/mcp", express.static(path.join(process.cwd(), ".well-known", "mcp")));
// MCP registry HTTP-domain auth: public keys for /.well-known/mcp-registry-auth
app.get("/.well-known/mcp-registry-auth", (req, res) => {
  res.type("application/json").send(fs.readFileSync(path.join(process.cwd(), ".well-known", "mcp-registry-auth"), "utf8"));
});

// Remote MCP server (Streamable HTTP) — exposes all 28 services as MCP tools.
mountMcp(app, { services: SERVICES, publicBase: PUBLIC_BASE });
app.get("/stats", (req, res) => {
  const paid = ledger.filter(e => e.status === "paid");
  res.json({
    requests_paid: paid.length,
    gross_usd: paid.reduce((s, e) => s + (e.usd || 0), 0),
    by_service: paid.reduce((m, e) => (m[e.service] = (m[e.service] || 0) + (e.usd || 0), m), {}),
    last_20: ledger.slice(-20),
  });
});

// ---------- x402 v1/v2 wire-format compatibility ----------
// @x402/express v2 puts the payment challenge ONLY in the base64 `payment-required`
// response header and sends `{}` as the 402 body. Live peers (api.onesource.io, verified
// 2026-09-12) put the same challenge in BOTH the header AND a full JSON body, and repeat
// every accept field under the v2 names (asset/amount/payTo) and the v1 names
// (currency/maxAmountRequired/recipient). Clients, indexers and LLM agents that parse the
// 402 body alone see nothing from us, so they cannot construct a payment — lost revenue.
// This middleware leaves the SDK header untouched (still canonical) and enriches the body.
function enrichRequirement(accept) {
  const a = { ...accept };
  if (a.amount !== undefined && a.maxAmountRequired === undefined) a.maxAmountRequired = a.amount;
  if (a.asset !== undefined && a.currency === undefined) a.currency = a.asset;
  if (a.payTo !== undefined && a.recipient === undefined) a.recipient = a.payTo;
  return a;
}

function paymentRequiredBodyFromHeader(headerValue) {
  try {
    const decoded = JSON.parse(Buffer.from(String(headerValue), "base64").toString("utf8"));
    if (decoded && Array.isArray(decoded.accepts)) {
      decoded.accepts = decoded.accepts.map(enrichRequirement);
    }
    decoded.meta = {
      protocol: "x402",
      agentpay: {
        how_to_pay:
          "Sign an EIP-3009 USDC transferWithAuthorization for accepts[0] and retry the same request with the base64 payment payload in the X-PAYMENT header. Node/TypeScript: use wrapFetchWithPayment from @x402/fetch, which handles the 402 retry automatically.",
        mcp: `${PUBLIC_BASE}/mcp`,
        catalogue: `${PUBLIC_BASE}/.well-known/x402`,
        docs: `${PUBLIC_BASE}/llms.txt`
      }
    };
    return decoded;
  } catch {
    return null;
  }
}

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const isEmptyObject =
      body && typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === 0;
    if (res.statusCode === 402 && isEmptyObject) {
      const enriched = paymentRequiredBodyFromHeader(res.getHeader("payment-required"));
      if (enriched) return originalJson(enriched);
    }
    return originalJson(body);
  };
  next();
});

// ---------- Payment middleware ----------
const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR });

// ---------- Paid route specs (single source of truth) ----------
// Discovery metadata for every paid route is generated by declareDiscoveryExtension so
// each index that parses our 402 challenge (CDP Bazaar / agentic.market, x402scan,
// PayAI Bazaar, x402.org) receives a complete input + output JSON Schema. CDP ranks
// listings on schema completeness and rejects verify/settle when a description exceeds
// 500 characters, so the length assertion below is load-bearing, not cosmetic.
const ROUTE_SPECS = [
  {
    path: "/v1/summarize", price: "$0.01", serviceName: "AgentPay Summarize",
    tags: ["summarize", "text", "nlp", "ai", "x402"],
    summary: "AI text summarization: condenses up to 20k characters into a crisp 250-word summary.",
    useWhen: "you have a long document, article, or transcript and need the gist before reasoning over it.",
    inputExample: { text: "Quarterly revenue rose 12% to $48M on strong enterprise demand, while gross margin held at 71%." },
    inputSchema: { type: "object", properties: { text: { type: "string", minLength: 1, maxLength: 20000, description: "Raw text to summarize" } }, required: ["text"] },
    outputExample: { summary: "Revenue grew 12% to $48M on enterprise demand with 71% gross margin.", words: 14 },
    outputSchema: { type: "object", properties: { summary: { type: "string" }, words: { type: "number" } } },
  },
  {
    path: "/v1/classify-insurance", price: "$0.02", serviceName: "AgentPay Insurance Classifier",
    tags: ["insurance", "classify", "intent", "ai", "x402"],
    summary: "Insurance lead classifier: extracts intent, urgency, and line of business from a customer message.",
    useWhen: "an inbound insurance enquiry must be triaged into a line of business and routed by urgency.",
    inputExample: { text: "My basement flooded last night, is water damage covered under my homeowners policy?" },
    inputSchema: { type: "object", properties: { text: { type: "string", minLength: 10, maxLength: 5000, description: "Customer message or enquiry" } }, required: ["text"] },
    outputExample: { intent: "claim", urgency: "high", line: "home", confidence: 0.93 },
    outputSchema: { type: "object", properties: { intent: { type: "string", enum: ["quote_request", "renewal", "claim", "complaint", "other"] }, urgency: { type: "string", enum: ["low", "medium", "high"] }, line: { type: "string" }, confidence: { type: "number" } } },
  },
  {
    path: "/v1/sentiment", price: "$0.02", serviceName: "AgentPay Sentiment",
    tags: ["sentiment", "analysis", "nlp", "ai", "x402"],
    summary: "Sentiment analysis returning polarity, confidence, emotions, and keywords.",
    useWhen: "you must gauge customer or market sentiment in free text and need machine-readable polarity.",
    inputExample: { text: "Support fixed my issue in ten minutes, genuinely impressed by the turnaround." },
    inputSchema: { type: "object", properties: { text: { type: "string", minLength: 10, maxLength: 5000, description: "Text to score" } }, required: ["text"] },
    outputExample: { sentiment: "positive", confidence: 0.94, emotions: ["satisfaction", "trust"], keywords: ["support", "impressed", "turnaround"] },
    outputSchema: { type: "object", properties: { sentiment: { type: "string", enum: ["positive", "negative", "neutral"] }, confidence: { type: "number" }, emotions: { type: "array", items: { type: "string" } }, keywords: { type: "array", items: { type: "string" } } } },
  },
  {
    path: "/v1/extract", price: "$0.03", serviceName: "AgentPay Extract",
    tags: ["extract", "structured", "documents", "ai", "x402"],
    summary: "Structured field extraction: pulls named key-value pairs out of emails, forms, and documents.",
    useWhen: "you need specific fields (invoice number, dates, amounts) lifted from unstructured text into JSON.",
    inputExample: { text: "Invoice INV-2291 dated 2026-08-14 from Northwind Traders totals $4,180.50.", fields: ["invoice_number", "date", "vendor", "total"] },
    inputSchema: { type: "object", properties: { text: { type: "string", minLength: 10, maxLength: 20000, description: "Source text" }, fields: { type: "array", items: { type: "string" }, description: "Field names to extract; omit to auto-detect" } }, required: ["text"] },
    outputExample: { invoice_number: "INV-2291", date: "2026-08-14", vendor: "Northwind Traders", total: "$4,180.50" },
    outputSchema: { type: "object", additionalProperties: { type: "string" } },
  },
  {
    path: "/v1/translate", price: "$0.03", serviceName: "AgentPay Translate",
    tags: ["translate", "language", "i18n", "ai", "x402"],
    summary: "Text translation from any language into a requested target language (default Spanish).",
    useWhen: "content must be localized before delivery to a user in another language.",
    inputExample: { text: "Your policy renews on 1 October. Reply STOP to opt out.", targetLanguage: "Tagalog" },
    inputSchema: { type: "object", properties: { text: { type: "string", minLength: 10, maxLength: 5000, description: "Source text" }, targetLanguage: { type: "string", description: "Target language name or ISO code; default Spanish" } }, required: ["text"] },
    outputExample: { translation: "Ang iyong patakaran ay magre-renew sa 1 Oktubre. I-reply ang STOP para mag-opt out.", targetLanguage: "Tagalog" },
    outputSchema: { type: "object", properties: { translation: { type: "string" }, targetLanguage: { type: "string" } } },
  },
  {
    path: "/v1/code-review", price: "$0.05", serviceName: "AgentPay Code Review",
    tags: ["code", "review", "security", "ai", "x402"],
    summary: "AI code review returning bugs, security issues, performance notes, and a quality score.",
    useWhen: "you need a second-pass review of a diff or function before committing it.",
    inputExample: { code: "function total(items){let t=0;for(let i=0;i<=items.length;i++){t+=items[i].price}return t}", language: "javascript" },
    inputSchema: { type: "object", properties: { code: { type: "string", minLength: 10, maxLength: 4000, description: "Source code to review" }, language: { type: "string", description: "Language hint, optional" } }, required: ["code"] },
    outputExample: { review: { issues: ["off-by-one loop bound (i<=items.length)"], suggestions: ["use reduce with a guard for missing price"], score: 62 }, language: "javascript" },
    outputSchema: { type: "object", properties: { review: { type: "object", properties: { issues: { type: "array", items: { type: "string" } }, suggestions: { type: "array", items: { type: "string" } }, score: { type: "number" } } }, language: { type: "string" } } },
  },
  {
    path: "/v1/insurance-analysis", price: "$0.10", serviceName: "AgentPay Full Analysis",
    tags: ["insurance", "analysis", "bundle", "ai", "x402"],
    summary: "Full insurance analysis bundle: classification, field extraction, summary, and recommended action in one call.",
    useWhen: "you need an end-to-end read of an insurance enquiry and want one call instead of three.",
    inputExample: { text: "I need commercial liability cover for a 12-truck fleet operating in Dubai from 1 November." },
    inputSchema: { type: "object", properties: { text: { type: "string", minLength: 10, maxLength: 20000, description: "Enquiry, claim, or document text" } }, required: ["text"] },
    outputExample: { classification: { intent: "quote_request", urgency: "medium", line: "commercial" }, extracted_fields: { fleet_size: "12", region: "Dubai", effective_date: "1 November" }, summary: "Commercial fleet liability enquiry for 12 trucks starting 1 November.", confidence: 0.91, recommended_action: "route to commercial underwriting" },
    outputSchema: { type: "object", properties: { classification: { type: "object" }, extracted_fields: { type: "object" }, summary: { type: "string" }, confidence: { type: "number" }, recommended_action: { type: "string" } } },
  },
  {
    path: "/v1/token-safety", price: "$0.02", serviceName: "AgentPay Token Safety",
    tags: ["crypto", "token", "safety", "rugpull", "x402"],
    summary: "Token safety check: rug-pull risk, honeypot detection, liquidity depth, and a 0-100 risk score.",
    useWhen: "an agent is about to interact with or recommend an ERC-20 and needs a safety verdict first.",
    inputExample: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", chain: "base" },
    inputSchema: { type: "object", properties: { address: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$", description: "ERC-20 contract address" }, chain: { type: "string", description: "Chain name or id, default base" } }, required: ["address"] },
    outputExample: { safe: true, risk_score: 8, flags: [], liquidity_usd: 4120000, honeypot: false },
    outputSchema: { type: "object", properties: { safe: { type: "boolean" }, risk_score: { type: "number" }, flags: { type: "array", items: { type: "string" } }, liquidity_usd: { type: "number" }, honeypot: { type: "boolean" } } },
  },
  {
    path: "/v1/wallet-risk", price: "$0.02", serviceName: "AgentPay Wallet Risk",
    tags: ["wallet", "risk", "sanctions", "compliance", "x402"],
    summary: "Wallet risk screening: OFAC sanctions exposure, scam flags, transaction profile, and risk level.",
    useWhen: "a counterparty address must be screened for sanctions or scam exposure before a transfer.",
    inputExample: { address: "0x3d1FABDa1cd175e7bF977562dC134bC8d89868D9", chain: "base" },
    inputSchema: { type: "object", properties: { address: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$", description: "Wallet address" }, chain: { type: "string", description: "Chain name or id, default base" } }, required: ["address"] },
    outputExample: { risk_level: "low", ofac_sanctioned: false, total_txns: 184, risk_factors: [] },
    outputSchema: { type: "object", properties: { risk_level: { type: "string" }, ofac_sanctioned: { type: "boolean" }, total_txns: { type: "number" }, risk_factors: { type: "array", items: { type: "string" } } } },
  },
  {
    path: "/v1/web-scrape", price: "$0.01", serviceName: "AgentPay Web Scrape",
    tags: ["scrape", "web", "extract", "content", "x402"],
    summary: "Fetches any URL and returns clean readable text with title and word count.",
    useWhen: "an agent needs the readable contents of a web page and cannot run a browser itself.",
    inputExample: { url: "https://example.com/report", max_chars: 8000 },
    inputSchema: { type: "object", properties: { url: { type: "string", format: "uri", description: "Absolute URL to fetch" }, max_chars: { type: "number", description: "Truncation limit, optional" } }, required: ["url"] },
    outputExample: { title: "Example Report", content: "First paragraphs of the page as plain text...", word_count: 812 },
    outputSchema: { type: "object", properties: { title: { type: "string" }, content: { type: "string" }, word_count: { type: "number" } } },
  },
  {
    path: "/v1/crypto-price", price: "$0.005", serviceName: "AgentPay Crypto Price",
    tags: ["crypto", "price", "market", "x402"],
    summary: "Real-time spot prices for a list of crypto assets in a chosen quote currency.",
    useWhen: "you need a current price snapshot for valuation or routing decisions.",
    inputExample: { symbols: ["BTC", "ETH", "SOL"], vs_currency: "usd" },
    inputSchema: { type: "object", properties: { symbols: { type: "array", items: { type: "string" }, description: "Ticker symbols" }, vs_currency: { type: "string", description: "Quote currency, default usd" } }, required: ["symbols"] },
    outputExample: { prices: { BTC: 96412.5, ETH: 3218.44, SOL: 188.02 }, vs_currency: "usd" },
    outputSchema: { type: "object", properties: { prices: { type: "object" }, vs_currency: { type: "string" } } },
  },
  {
    path: "/v1/image-describe", price: "$0.03", serviceName: "AgentPay Image Describe",
    tags: ["vision", "image", "caption", "ai", "x402"],
    summary: "Vision model describes an image from a URL and lists the objects it contains.",
    useWhen: "you must reason about an image you cannot render and need a textual description.",
    inputExample: { image_url: "https://example.com/storefront.jpg", detail: "high" },
    inputSchema: { type: "object", properties: { image_url: { type: "string", format: "uri", description: "Publicly reachable image URL" }, detail: { type: "string", enum: ["low", "high"], description: "Detail level, optional" } }, required: ["image_url"] },
    outputExample: { description: "A corner shop with a green awning and a sandwich board outside.", objects: ["storefront", "awning", "signboard"] },
    outputSchema: { type: "object", properties: { description: { type: "string" }, objects: { type: "array", items: { type: "string" } } } },
  },
  {
    path: "/v1/defi-yields", price: "$0.01", serviceName: "AgentPay DeFi Yields",
    tags: ["defi", "yield", "apy", "tvl", "x402"],
    summary: "DeFi yield data: APY, TVL, and protocol metadata for lending and LP opportunities.",
    useWhen: "you are comparing yield venues and need current APY and TVL figures.",
    inputExample: { protocol: "aave", chain: "base" },
    inputSchema: { type: "object", properties: { protocol: { type: "string", description: "Protocol slug, optional" }, chain: { type: "string", description: "Chain filter, optional" } } },
    outputExample: { yields: [{ protocol: "aave", chain: "base", asset: "USDC", apy: 4.82, tvl_usd: 91200000 }] },
    outputSchema: { type: "object", properties: { yields: { type: "array", items: { type: "object" } } } },
  },
  {
    path: "/v1/threat-intel", price: "$0.02", serviceName: "AgentPay Threat Intel",
    tags: ["security", "cve", "vulnerability", "x402"],
    summary: "Vulnerability lookup by CVE id or keyword with severity and exploitation context.",
    useWhen: "you must assess whether a dependency or component carries a known vulnerability.",
    inputExample: { cve_id: "CVE-2026-1234" },
    inputSchema: { type: "object", properties: { cve_id: { type: "string", description: "CVE identifier" }, keyword: { type: "string", description: "Keyword search instead of a CVE id, optional" } } },
    outputExample: { cve_id: "CVE-2026-1234", severity: "high", description: "Improper input validation in a widely used HTTP parser.", kev_listed: false },
    outputSchema: { type: "object", properties: { cve_id: { type: "string" }, severity: { type: "string" }, description: { type: "string" } } },
  },
  {
    path: "/v1/sanctions-screen", price: "$0.02", serviceName: "AgentPay Sanctions Screen",
    tags: ["sanctions", "ofac", "compliance", "kyc", "x402"],
    summary: "Screens a person or entity name against OFAC, EU, and UN sanctions lists.",
    useWhen: "an onboarding or payment flow must confirm a counterparty is not a sanctioned party.",
    inputExample: { name: "Northwind Traders LLC", type: "entity" },
    inputSchema: { type: "object", properties: { name: { type: "string", description: "Person or entity name" }, type: { type: "string", enum: ["person", "entity"], description: "Screening type, optional" } }, required: ["name"] },
    outputExample: { sanctioned: false, lists: [], match_score: 0.0 },
    outputSchema: { type: "object", properties: { sanctioned: { type: "boolean" }, lists: { type: "array", items: { type: "string" } } } },
  },
  {
    path: "/v1/market-intel", price: "$0.02", serviceName: "AgentPay Market Intel",
    tags: ["macro", "economics", "gdp", "inflation", "x402"],
    summary: "Macroeconomic snapshot for a country: GDP, inflation, policy rate, and unemployment.",
    useWhen: "you need macro context before pricing, forecasting, or country-risk commentary.",
    inputExample: { country: "United Arab Emirates" },
    inputSchema: { type: "object", properties: { country: { type: "string", description: "Country name, optional" } } },
    outputExample: { country: "United Arab Emirates", data: { gdp_usd: 504000000000, inflation_pct: 2.1, policy_rate_pct: 4.4 } },
    outputSchema: { type: "object", properties: { country: { type: "string" }, data: { type: "object" } } },
  },
  {
    path: "/v1/on-chain-events", price: "$0.01", serviceName: "AgentPay On-Chain Events",
    tags: ["onchain", "events", "transfers", "x402"],
    summary: "Recent decoded on-chain events and transfers for an address.",
    useWhen: "you need a compact history of what an address has been doing on-chain.",
    inputExample: { address: "0x3d1FABDa1cd175e7bF977562dC134bC8d89868D9", chain: "base" },
    inputSchema: { type: "object", properties: { address: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$", description: "Wallet address" }, chain: { type: "string", description: "Chain name or id, default base" } }, required: ["address"] },
    outputExample: { events: [{ type: "erc20_transfer", asset: "USDC", amount: "0.03", direction: "in" }] },
    outputSchema: { type: "object", properties: { events: { type: "array", items: { type: "object" } } } },
  },
  {
    path: "/v1/content-safety", price: "$0.02", serviceName: "AgentPay Content Safety",
    tags: ["safety", "pii", "moderation", "x402"],
    summary: "Content safety scan flagging PII, toxicity, and bias markers in text.",
    useWhen: "text must be cleared before it is published, stored, or forwarded.",
    inputExample: { text: "Contact john.doe@example.com or call +1 555 0100 to confirm." },
    inputSchema: { type: "object", properties: { text: { type: "string", minLength: 1, maxLength: 20000, description: "Text to scan" } }, required: ["text"] },
    outputExample: { safe: false, flags: [{ type: "pii", subtype: "email" }, { type: "pii", subtype: "phone" }] },
    outputSchema: { type: "object", properties: { safe: { type: "boolean" }, flags: { type: "array", items: { type: "object" } } } },
  },
  {
    path: "/v1/agent-reputation", price: "$0.01", serviceName: "AgentPay Agent Reputation",
    tags: ["reputation", "trust", "agent", "x402"],
    summary: "Reputation score and letter grade for an agent or service endpoint URL.",
    useWhen: "you are about to transact with an unknown agent endpoint and want a trust signal.",
    inputExample: { endpoint_url: "https://agentpay.help/mcp" },
    inputSchema: { type: "object", properties: { endpoint_url: { type: "string", format: "uri", description: "Endpoint to score" } }, required: ["endpoint_url"] },
    outputExample: { score: 84, grade: "A", signals: { reachable: true, x402: true, uptime_pct: 99.6 } },
    outputSchema: { type: "object", properties: { score: { type: "number" }, grade: { type: "string" } } },
  },
  {
    path: "/v1/legal-lookup", price: "$0.03", serviceName: "AgentPay Legal Lookup",
    tags: ["legal", "registry", "company", "x402"],
    summary: "Company registration and regulatory lookup by name or jurisdiction.",
    useWhen: "you must verify a company exists and is registered before contracting.",
    inputExample: { query: "Northwind Traders LLC", jurisdiction: "Delaware" },
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Company name or registration number" }, jurisdiction: { type: "string", description: "Jurisdiction filter, optional" } }, required: ["query"] },
    outputExample: { results: [{ name: "Northwind Traders LLC", jurisdiction: "Delaware", status: "active", incorporation_date: "2019-04-02" }] },
    outputSchema: { type: "object", properties: { results: { type: "array", items: { type: "object" } } } },
  },
  {
    path: "/v1/news-feed", price: "$0.005", serviceName: "AgentPay News Feed",
    tags: ["news", "headlines", "feed", "x402"],
    summary: "Recent news headlines matching a topic query.",
    useWhen: "you need a current awareness snapshot on a topic, company, or event.",
    inputExample: { query: "insurance regulation Dubai", limit: 10 },
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Topic or keyword query" }, limit: { type: "number", description: "Max articles, optional" } }, required: ["query"] },
    outputExample: { articles: [{ title: "Regulator issues new broker disclosure rules", source: "example.com", published: "2026-09-11" }] },
    outputSchema: { type: "object", properties: { articles: { type: "array", items: { type: "object" } } } },
  },
  {
    path: "/v1/weather-data", price: "$0.005", serviceName: "AgentPay Weather Data",
    tags: ["weather", "forecast", "data", "x402"],
    summary: "Current conditions and multi-day forecast for a location.",
    useWhen: "a workflow depends on weather at a location (routing, events, logistics).",
    inputExample: { location: "Dubai", days: 3 },
    inputSchema: { type: "object", properties: { location: { type: "string", description: "City or place name" }, days: { type: "number", description: "Forecast days, optional" } }, required: ["location"] },
    outputExample: { location: "Dubai", current: { temp_c: 38, conditions: "clear" }, forecast: [{ date: "2026-09-13", temp_max_c: 39 }] },
    outputSchema: { type: "object", properties: { location: { type: "string" }, current: { type: "object" }, forecast: { type: "array", items: { type: "object" } } } },
  },
  {
    path: "/v1/web-search", price: "$0.01", serviceName: "AgentPay Web Search",
    tags: ["search", "web", "engine", "duckduckgo", "x402"],
    summary: "Web search: top results for any query with title, URL, and snippet.",
    useWhen: "an agent needs current web information it was not trained on before answering.",
    inputExample: { query: "best yield farming strategies on Base 2026", max_results: 8 },
    inputSchema: { type: "object", properties: { query: { type: "string", minLength: 2, maxLength: 400, description: "Search query" }, max_results: { type: "number", description: "Max results 1-10, default 8" } }, required: ["query"] },
    outputExample: { query: "best yield farming strategies on Base 2026", results: [{ title: "Yield Guide — Base", url: "https://example.com/yield-base", snippet: "Aave v3 and Morpho lead Base yields..." }], count: 1 },
    outputSchema: { type: "object", properties: { query: { type: "string" }, results: { type: "array", items: { type: "object", properties: { title: { type: "string" }, url: { type: "string", format: "uri" }, snippet: { type: "string" } } } }, count: { type: "number" } } },
  },
  {
    path: "/v1/memory", price: "$0.005", serviceName: "AgentPay Memory",
    tags: ["memory", "storage", "state", "kv", "agents", "x402"],
    summary: "Persistent wallet-scoped key-value memory: agents remember facts across runs.",
    useWhen: "a stateless agent must persist context, preferences, or intermediate results between sessions.",
    inputExample: { action: "set", key: "user_name", value: "Ronald", namespace: "prefs" },
    inputSchema: { type: "object", properties: { action: { type: "string", enum: ["get", "set", "delete", "list"], description: "Operation" }, key: { type: "string", maxLength: 200, description: "Key (required for get/set/delete)" }, value: { description: "Value to store (required for set, any JSON)" }, namespace: { type: "string", maxLength: 50, description: "Namespace, default 'default'" } }, required: ["action"] },
    outputExample: { ok: true, key: "user_name", namespace: "prefs", value: "Ronald" },
    outputSchema: { type: "object", properties: { ok: { type: "boolean" }, key: { type: "string" }, namespace: { type: "string" }, value: {} } },
  },
  {
    path: "/v1/geocode", price: "$0.005", serviceName: "AgentPay Geocode",
    tags: ["geocode", "maps", "location", "coordinates", "x402"],
    summary: "Geocode place names to coordinates, or reverse geocode coordinates to addresses.",
    useWhen: "a workflow must convert between place names and lat/lon before calling geo-aware APIs.",
    inputExample: { query: "Dubai" },
    inputSchema: { type: "object", properties: { query: { type: "string", minLength: 1, description: "Place name, or 'lat,lon' for reverse lookup" }, reverse: { type: "boolean", description: "Force reverse mode, optional" } }, required: ["query"] },
    outputExample: { query: "Dubai", reverse: false, results: [{ name: "Dubai", country: "United Arab Emirates", country_code: "AE", lat: 25.07725, lon: 55.30927, population: 3790000, timezone: "Asia/Dubai" }], count: 1 },
    outputSchema: { type: "object", properties: { query: { type: "string" }, reverse: { type: "boolean" }, results: { type: "array", items: { type: "object" } }, address: { type: "string" }, location: { type: "object" }, count: { type: "number" } } },
  },
  {
    path: "/v1/eth-gas", price: "$0.003", serviceName: "AgentPay ETH Gas",
    tags: ["gas", "ethereum", "fees", "onchain", "x402"],
    summary: "Ethereum gas prices: rapid, fast, standard, and slow tiers in gwei plus ETH spot price.",
    useWhen: "an agent must time transactions or estimate fees before submitting on-chain operations.",
    inputExample: {},
    outputExample: { eth_usd: 2526, gwei: { rapid: 2.02, fast: 2.02, standard: 0.46, slow: 0.15 }, updated_at: "2026-09-13T00:00:00.000Z" },
    outputSchema: { type: "object", properties: { eth_usd: { type: "number" }, gwei: { type: "object", properties: { rapid: { type: "number" }, fast: { type: "number" }, standard: { type: "number" }, slow: { type: "number" } } }, updated_at: { type: "string" } } },
  },
  {
    path: "/v1/prediction-market", price: "$0.01", serviceName: "AgentPay Prediction Markets",
    tags: ["polymarket", "prediction", "odds", "markets", "x402"],
    summary: "Polymarket prediction market odds: live probabilities for events matching a topic.",
    useWhen: "an agent needs crowd-sourced probability estimates for future events before deciding.",
    inputExample: { query: "fed rate", limit: 5 },
    inputSchema: { type: "object", properties: { query: { type: "string", minLength: 2, description: "Topic to search markets for" }, limit: { type: "number", description: "Max events 1-10, default 5" } }, required: ["query"] },
    outputExample: { query: "fed rate", events: [{ title: "Fed rate hike in 2026?", end_date: "2026-12-31T00:00:00Z", markets: [{ question: "Fed Rate Hike by June 2026 Meeting?", outcomes: { Yes: 0.0, No: 1.0 }, volume: "128000" }] }], count: 1 },
    outputSchema: { type: "object", properties: { query: { type: "string" }, events: { type: "array", items: { type: "object" } }, count: { type: "number" } } },
  },
  {
    path: "/v1/deep-research", price: "$0.25", serviceName: "AgentPay Deep Research",
    tags: ["research", "report", "citations", "premium", "ai", "x402"],
    summary: "Premium deep research: searches, reads multiple sources, and writes a cited markdown report.",
    useWhen: "you need a defensible mini-report on a topic with inline source citations, not just search links.",
    inputExample: { topic: "state of x402 protocol adoption September 2026", depth: "standard" },
    inputSchema: { type: "object", properties: { topic: { type: "string", minLength: 4, maxLength: 400, description: "Research topic or question" }, depth: { type: "string", enum: ["standard", "deep"], description: "standard = ~5 sources, deep = ~8 sources + wider corpus" } }, required: ["topic"] },
    outputExample: { topic: "state of x402 protocol adoption September 2026", depth: "standard", report: "## Executive Summary\n...\n\n## Key Findings\n1. ... [S1]\n", citations: [{ id: "S1", url: "https://example.com/source", title: "Example Source" }], stats: { sources_read: 5, search_results: 5, report_words: 612 } },
    outputSchema: { type: "object", properties: { topic: { type: "string" }, depth: { type: "string" }, report: { type: "string" }, citations: { type: "array", items: { type: "object" } }, stats: { type: "object" } } },
  },
];

const PAID_ROUTES = Object.fromEntries(
  ROUTE_SPECS.map((spec) => {
    const description = `${spec.summary} Use when ${spec.useWhen}`;
    if (description.length > 500) {
      throw new Error(`route description exceeds the 500-char CDP limit: ${spec.path}`);
    }
    return [
      `POST ${spec.path}`,
      {
        accepts: [{ scheme: "exact", price: spec.price, network: NETWORK, payTo: PAY_TO }],
        description,
        mimeType: "application/json",
        serviceName: spec.serviceName,
        tags: spec.tags,
        extensions: declareDiscoveryExtension({
          method: "POST",
          bodyType: "json",
          input: spec.inputExample,
          inputSchema: spec.inputSchema,
          output: { example: spec.outputExample, schema: spec.outputSchema },
        }),
      },
    ];
  })
);

if (process.env.AGENTPAY_DEV_BYPASS === "1") {
  // Dev-only: skip settlement entirely and identify every caller as a loopback dev payer.
  // Production never sets this flag, so the real paywall below is always active there.
  console.warn("[DEV] AGENTPAY_DEV_BYPASS=1 — x402 settlement DISABLED, all routes open");
  app.use("/v1", (req, res, next) => {
    req.x402Payment = { payer: "dev-loopback", scheme: "exact", devBypass: true };
    next();
  });
} else {
  app.use(
    paymentMiddleware(
      PAID_ROUTES,
      new x402ResourceServer(facilitatorClient).register(NETWORK, new ExactEvmScheme()),
    ),
  );
}

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
*{box-sizing:border-box}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#080b12;color:#c9cdd5;margin:0;padding:0;max-width:100%;overflow-x:hidden}
.container{max-width:72rem;margin-inline:auto;padding:2rem 2.5rem}
.header-row{display:flex;align-items:center;gap:1.25rem;margin-bottom:.5rem}
.logo-img{width:72px;height:72px;border-radius:14px;box-shadow:0 0 30px rgba(110,231,160,.12)}
h1{color:#e8fbe9;font-size:2.4rem;margin:0;letter-spacing:-.03em;font-weight:800}
h2{color:#e0e4ec;margin-top:2.5rem;font-size:1.35rem;letter-spacing:-.02em;display:flex;align-items:center;gap:.6rem}
h2 .icon{color:#6ee7a0;font-size:1.1rem}
.tagline{color:#8a92a3;font-size:1.1rem;margin-bottom:1.8rem;line-height:1.6}
.tagline b{color:#c9cdd5}
/* Stats */
.stats-row{display:flex;flex-wrap:wrap;gap:.6rem;margin-bottom:2rem}
.stat{display:inline-flex;flex-direction:column;background:linear-gradient(135deg,#101624,#0e1220);border:1px solid #1c2234;padding:.85rem 1.4rem;border-radius:12px;min-width:10rem}
.stat b{font-size:1.5rem;color:#6ee7a0;font-weight:800;letter-spacing:-.02em}
.stat span{color:#5a6270;font-size:.8rem;margin-top:.15rem;text-transform:uppercase;letter-spacing:.06em}
.cta{display:inline-flex;align-items:center;gap:.4rem;background:linear-gradient(135deg,#6ee7a0,#4ad680);color:#080b12;padding:.65rem 1.6rem;border-radius:10px;text-decoration:none;font-weight:700;font-size:.95rem;margin-left:.5rem;transition:all .15s;box-shadow:0 2px 12px rgba(110,231,160,.2)}
.cta:hover{transform:translateY(-1px);box-shadow:0 4px 20px rgba(110,231,160,.3)}
/* Category Tabs */
.tabs{display:flex;gap:.4rem;margin-bottom:1.2rem;flex-wrap:wrap}
.tab{background:#101624;border:1px solid #1c2234;color:#6a7386;padding:.45rem 1rem;border-radius:8px;cursor:pointer;font-size:.85rem;font-weight:600;transition:all .15s;user-select:none}
.tab:hover{border-color:#2a3550;color:#9dc3ff}
.tab.active{background:#15202e;border-color:#3b5998;color:#9dc3ff;box-shadow:0 0 12px rgba(157,195,255,.08)}
/* Service Cards */
.endpoints{display:grid;grid-template-columns:repeat(auto-fill,minmax(20rem,1fr));gap:.7rem;margin-top:0}
.card{background:linear-gradient(135deg,#0f1520,#0d111c);border:1px solid #1a1f30;border-radius:10px;padding:1.1rem 1.2rem;transition:border-color .15s,transform .15s}
.card:hover{border-color:#2a3550;transform:translateY(-2px)}
.card .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem}
.card .price{color:#6ee7a0;font-weight:800;font-size:1.05rem;background:rgba(110,231,160,.08);padding:.15rem .55rem;border-radius:6px}
.card .path{color:#7aabff;font-family:'SF Mono',Menlo,monospace;font-size:.8rem;word-break:break-all}
.card .desc{color:#7a8293;font-size:.85rem;margin-top:.45rem;line-height:1.45}
.tag{display:inline-block;background:rgba(110,231,160,.07);color:#5cc98a;padding:.12rem .5rem;border-radius:5px;font-size:.72rem;margin-top:.4rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
/* Try Free Section */
.try-free{background:linear-gradient(135deg,#0d1a12,#0b1510);border:1px solid #1a3320;border-radius:14px;padding:1.8rem 2rem;margin-top:2.5rem}
.try-free h3{color:#6ee7a0;margin:0 0 .6rem;font-size:1.2rem}
.try-free p{color:#6a8a72;margin:0 0 1rem;font-size:.9rem}
.try-free pre{background:#0a100d;border:1px solid #1a3320;border-radius:8px;padding:1rem 1.2rem;overflow-x:auto;font-size:.82rem;color:#a8d8b4;line-height:1.55}
.try-free pre .kw{color:#6ee7a0;font-weight:700}
.try-free pre .str{color:#d4a06a}
.try-free pre .cmt{color:#4a6a50}
.try-result{background:#0a100d;border:1px solid #1a3320;border-radius:8px;padding:1rem 1.2rem;margin-top:.75rem;font-size:.82rem;color:#8aaa8e;font-family:'SF Mono',Menlo,monospace;white-space:pre-wrap}
/* Agent Integration Section */
.agent-section{background:linear-gradient(135deg,#0d0f1a,#0a0c15);border:1px solid #1a1d30;border-radius:14px;padding:1.8rem 2rem;margin-top:2.5rem}
.agent-section h3{color:#9dc3ff;margin:0 0 .4rem;font-size:1.2rem}
.agent-section .agent-desc{color:#6a7080;font-size:.9rem;margin-bottom:1.2rem}
.agent-links{display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:1.2rem}
.agent-link{display:inline-flex;align-items:center;gap:.3rem;background:#101624;border:1px solid #1c2234;color:#9dc3ff;padding:.4rem .8rem;border-radius:8px;text-decoration:none;font-size:.82rem;font-weight:600;transition:all .15s}
.agent-link:hover{border-color:#3b5998;background:#15202e}
.code-tabs{display:flex;gap:.3rem;margin-bottom:0}
.code-tab{background:#0a0c15;border:1px solid #1a1d30;border-bottom:none;color:#5a6270;padding:.4rem .9rem;border-radius:8px 8px 0 0;cursor:pointer;font-size:.8rem;font-weight:600;transition:all .15s}
.code-tab:hover{color:#8a92a3}
.code-tab.active{background:#0f1320;color:#9dc3ff;border-color:#2a3550}
.code-block{background:#0f1320;border:1px solid #1a1d30;border-radius:0 8px 8px 8px;padding:1.1rem 1.3rem;overflow-x:auto;font-size:.82rem;line-height:1.6;color:#b0b8c8;font-family:'SF Mono',Menlo,monospace;position:relative}
.code-block .copy-btn{position:absolute;top:.6rem;right:.6rem;background:#1a1f30;border:1px solid #2a3550;color:#6a7386;padding:.3rem .6rem;border-radius:6px;cursor:pointer;font-size:.72rem;font-weight:600;transition:all .15s}
.code-block .copy-btn:hover{background:#2a3550;color:#9dc3ff}
.code-block .k{color:#c792ea}.code-block .s{color:#c3e88d}.code-block .c{color:#546e7a;font-style:italic}.code-block .f{color:#82aaff}.code-block .n{color:#f78c6c}
/* Footer */
.powered{text-align:center;color:#3a4050;font-size:.8rem;margin-top:3rem;border-top:1px solid #141824;padding-top:1.5rem}
.powered a{color:#6ee7a0}
/* Category badge colors */
.cat-nlp{background:rgba(110,231,160,.07);color:#5cc98a}
.cat-finance{background:rgba(245,190,80,.07);color:#d4a06a}
.cat-security{background:rgba(235,100,100,.07);color:#d07070}
.cat-data{background:rgba(157,195,255,.07);color:#7aabff}
.cat-bundle{background:rgba(200,140,255,.07);color:#b88cee}
/* Responsive */
@media(max-width:700px){.container{padding:1.2rem 1rem}.endpoints{grid-template-columns:1fr}.tabs{gap:.3rem}.tab{padding:.35rem .7rem;font-size:.78rem}.stats-row{gap:.4rem}.stat{min-width:7rem;padding:.6rem .9rem}.stat b{font-size:1.1rem}.agent-links{gap:.3rem}}`;

const ALL_SERVICES_HTML = [
  // Text / NLP
  { path: "POST /v1/summarize", price: "$0.01", desc: "Crisp 250-word summary of any text up to 20k characters", tag: "nlp", cat: "nlp" },
  { path: "POST /v1/sentiment", price: "$0.02", desc: "Sentiment analysis — positive/negative/neutral with emotions &amp; keywords", tag: "nlp", cat: "nlp" },
  { path: "POST /v1/extract", price: "$0.03", desc: "Structured field extraction from emails, forms, documents", tag: "nlp", cat: "nlp" },
  { path: "POST /v1/translate", price: "$0.03", desc: "Text translation to any language", tag: "nlp", cat: "nlp" },
  { path: "POST /v1/content-safety", price: "$0.02", desc: "Content security scan — PII, toxicity, bias detection", tag: "nlp", cat: "nlp" },
  { path: "POST /v1/image-describe", price: "$0.03", desc: "Vision AI — describe any image from URL", tag: "nlp", cat: "nlp" },
  // Finance / Crypto
  { path: "POST /v1/crypto-price", price: "$0.005", desc: "Real-time crypto prices — BTC, ETH, SOL + more", tag: "finance", cat: "finance" },
  { path: "POST /v1/token-safety", price: "$0.02", desc: "Token safety check — rug pull risk, honeypot detection", tag: "finance", cat: "finance" },
  { path: "POST /v1/defi-yields", price: "$0.01", desc: "DeFi yield data — APY, TVL, protocol info from DeFiLlama", tag: "finance", cat: "finance" },
  { path: "POST /v1/wallet-risk", price: "$0.02", desc: "Wallet risk screening — OFAC sanctions, scam flags, patterns", tag: "finance", cat: "finance" },
  { path: "POST /v1/on-chain-events", price: "$0.01", desc: "Decoded on-chain events — recent transfers &amp; calls", tag: "finance", cat: "finance" },
  { path: "POST /v1/market-intel", price: "$0.02", desc: "Macro/economic snapshot — GDP, inflation, rates by country", tag: "finance", cat: "finance" },
  // Security / Compliance
  { path: "POST /v1/threat-intel", price: "$0.02", desc: "CVE/threat intelligence — vulnerability lookup &amp; severity", tag: "security", cat: "security" },
  { path: "POST /v1/sanctions-screen", price: "$0.02", desc: "OFAC/EU sanctions screening — entity check", tag: "security", cat: "security" },
  { path: "POST /v1/code-review", price: "$0.05", desc: "AI code review — bugs, security, performance, quality", tag: "security", cat: "security" },
  { path: "POST /v1/agent-reputation", price: "$0.01", desc: "Agent reputation score — endpoint trustworthiness check", tag: "security", cat: "security" },
  { path: "POST /v1/legal-lookup", price: "$0.03", desc: "Legal/regulatory lookup — company registration data", tag: "security", cat: "security" },
  // Data / Web
  { path: "POST /v1/web-scrape", price: "$0.01", desc: "Extract clean text from any URL — agents read web pages", tag: "data", cat: "data" },
  { path: "POST /v1/news-feed", price: "$0.005", desc: "Real-time news feed — headlines by topic", tag: "data", cat: "data" },
  { path: "POST /v1/weather-data", price: "$0.005", desc: "Weather data — current conditions &amp; multi-day forecast", tag: "data", cat: "data" },
  { path: "POST /v1/classify-insurance", price: "$0.02", desc: "Insurance lead classifier — intent, urgency, line of business", tag: "data", cat: "data" },
  // Bundle (cross-category)
  { path: "POST /v1/insurance-analysis", price: "$0.10", desc: "⭐ FULL BUNDLE — classification + extraction + summary in one call", tag: "bundle", cat: "bundle" },
];

const catLabels = { nlp: "Text / NLP", finance: "Finance / Crypto", security: "Security / Compliance", data: "Data / Web", bundle: "Bundle" };
const catClasses = { nlp: "cat-nlp", finance: "cat-finance", security: "cat-security", data: "cat-data", bundle: "cat-bundle" };

function indexPage() {
  const gross = (ledger.filter(e=>e.status==="paid").reduce((s,e)=>s+(e.usd||0),0)).toFixed(2);
  const paid = ledger.filter(e=>e.status==="paid").length;

  // Build tab HTML
  const cats = ["all", "nlp", "finance", "security", "data", "bundle"];
  const catLabelsAll = { all: "All Services", ...catLabels };
  const tabsHTML = cats.map(c => `<div class="tab${c==="all"?" active":""}" data-cat="${c}">${catLabelsAll[c]}</div>`).join("");

  // Build card HTML with data-cat attributes
  const cardsHTML = ALL_SERVICES_HTML.map(s =>
    `<div class="card" data-cat="${s.cat}"><div class="top"><span class="price">${s.price}</span></div><span class="path">${s.path}</span><div class="desc">${s.desc}</div><span class="tag ${catClasses[s.cat]||"cat-nlp"}">${catLabels[s.cat]||s.tag}</span></div>`
  ).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AgentPay — 28 AI microservices via x402</title>
<meta name="description" content="Pay-per-call AI services via the 402 Payment Required protocol. No accounts, no API keys — just USDC on Base.">
<meta property="og:title" content="AgentPay — 28 AI microservices via x402"><meta property="og:description" content="Pay-per-call AI services. No accounts. No API keys. USDC on Base.">
<meta property="og:image" content="https://agentpay.help/branding/final/og-image.png"><meta property="og:url" content="https://agentpay.help">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="AgentPay"><meta name="twitter:description" content="28 pay-per-call AI services via x402"><meta name="twitter:image" content="https://agentpay.help/branding/final/og-image.png">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"AgentPay","description":"28 pay-per-call AI microservices via x402","url":"https://agentpay.help","applicationCategory":"DeveloperApplication","author":{"@type":"Person","name":"Ronald Anton"}}</script>
<link rel="icon" type="image/x-icon" href="/branding/final/favicon.ico">
<link rel="apple-touch-icon" href="/branding/final/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>${INDEX_CSS}</style></head><body>
<div class="container">

<div class="header-row">
  <img src="/branding/final/logo-clean-64.png" alt="AgentPay" class="logo-img">
  <h1>AgentPay</h1>
</div>
<p class="tagline">AI microservices behind the <b>402 Payment Required</b> protocol (x402 / MPP).<br>No accounts. No API keys. Pay per call in <b>USDC on Base</b>.</p>

<div class="stats-row">
  <div class="stat"><b>$${gross}</b><span>gross revenue</span></div>
  <div class="stat"><b>${paid}</b><span>paid requests</span></div>
  <div class="stat"><b>22</b><span>services live</span></div>
  <a href="/stats" class="cta">📊 Dashboard</a>
</div>

<h2><span class="icon">✦</span> Services &amp; Pricing</h2>
<div class="tabs">${tabsHTML}</div>
<div class="endpoints">${cardsHTML}</div>

<div class="try-free">
  <h3>⚡ Try Free — No Payment Required</h3>
  <p>Test the summarize API instantly. This demo endpoint is free (up to 3 requests per session).</p>
  <pre><span class="cmt"># Free summarize — no wallet needed</span>
<span class="kw">curl</span> -X POST <span class="str">${PUBLIC_BASE}/v1/summarize-free</span> \\
  -H <span class="str">'Content-Type: application/json'</span> \\
  -d <span class="str">'{"text":"AgentPay is a marketplace of AI microservices. Each endpoint is paywalled via the x402 protocol, meaning clients pay USDC per request with no accounts or API keys. The platform runs on Base (L2) and uses a facilitator for instant settlement. Services include text summarization, sentiment analysis, code review, crypto safety, DeFi yields, and more."}'</span></pre>
  <div class="try-result"><span class="cmt">// Response:</span>
{
  "summary": "AgentPay is a pay-per-call AI marketplace using the x402 protocol with USDC on Base...",
  "words": 42,
  "demo": true
}</div>
</div>

<div class="agent-section">
  <h3>🤖 For AI Agents</h3>
  <p class="agent-desc">Machine-readable discovery &amp; integration. Any x402-compatible agent can discover, price, and call our endpoints automatically.</p>
  <div class="agent-links">
    <a href="/llms.txt" class="agent-link">📄 llms.txt</a>
    <a href="/.well-known/x402" class="agent-link">🏪 x402 Catalog</a>
    <a href="/openapi.json" class="agent-link">📋 OpenAPI 3.0</a>
    <a href="/.well-known/agent.json" class="agent-link">🪪 Agent Card</a>
    <a href="/health" class="agent-link">💚 Health</a>
    <a href="/stats" class="agent-link">📊 Stats</a>
    <a href="https://github.com/ronaldanton/x402-shop" class="agent-link">📦 Source (Apache-2.0)</a>
  </div>

  <div class="code-tabs">
    <div class="code-tab active" data-lang="python">Python</div>
    <div class="code-tab" data-lang="node">Node.js</div>
    <div class="code-tab" data-lang="curl">curl</div>
  </div>

  <div class="code-block" id="code-python" style="display:block">
<button class="copy-btn" onclick="copyCode('python')">Copy</button>
<span class="c"># pip install x402-fetch viem</span>
<span class="k">from</span> x402_fetch <span class="k">import</span> x402_fetch

url = <span class="s">"${PUBLIC_BASE}/v1/summarize"</span>
body = {<span class="s">"text"</span>: <span class="s">"Your long text to summarize..."</span>}

<span class="c"># x402_fetch handles the 402 → pay → retry cycle automatically</span>
result = x402_fetch(url, json=body)
<span class="f">print</span>(result)</div>

  <div class="code-block" id="code-node" style="display:none">
<button class="copy-btn" onclick="copyCode('node')">Copy</button>
<span class="c">// npm i @x402/fetch viem</span>
<span class="k">import</span> { x402Fetch } <span class="k">from</span> <span class="s">"@x402/fetch"</span>;

<span class="k">const</span> res = <span class="k">await</span> <span class="f">x402Fetch</span>(<span class="s">"${PUBLIC_BASE}/v1/summarize"</span>, {
  method: <span class="s">"POST"</span>,
  headers: { <span class="s">"Content-Type"</span>: <span class="s">"application/json"</span> },
  body: JSON.stringify({ text: <span class="s">"Your long text..."</span> }),
});
console.<span class="f">log</span>(<span class="k">await</span> res.<span class="f">json</span>());</div>

  <div class="code-block" id="code-curl" style="display:none">
<button class="copy-btn" onclick="copyCode('curl')">Copy</button>
<span class="c"># Step 1: Hit endpoint — get HTTP 402 with payment terms</span>
curl -i -X POST <span class="s">${PUBLIC_BASE}/v1/summarize</span> \\
  -H <span class="s">'Content-Type: application/json'</span> \\
  -d <span class="s">'{"text":"Your text here..."}'</span>

<span class="c"># Step 2: Pay via x402 client (handles USDC transfer + retry)</span>
<span class="c"># Response includes your AI result after payment settles</span></div>
</div>

<p class="powered">Powered by <a href="https://github.com/ronaldanton/x402-shop">x402-shop</a> · <a href="https://x402.org">x402 protocol</a> · Built on Base</p>

</div><!-- /container -->

<script>
// Category tab filtering
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const cat = tab.dataset.cat;
    document.querySelectorAll('.card').forEach(card => {
      card.style.display = (cat === 'all' || card.dataset.cat === cat) ? '' : 'none';
    });
  });
});

// Code tab switching
document.querySelectorAll('.code-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.code-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.code-block').forEach(b => b.style.display = 'none');
    document.getElementById('code-' + tab.dataset.lang).style.display = 'block';
  });
});

// Copy button
function copyCode(lang) {
  const block = document.getElementById('code-' + lang);
  const btn = block.querySelector('.copy-btn');
  const text = block.textContent.replace('Copy', '').trim();
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 2000);
  });
}
</script>
</body></html>`;

}

// ========== NEW SERVICES: x402scan trending ==========
app.post("/v1/token-safety", async (req, res) => { try { const { address } = req.body; if (!address?.startsWith("0x")) return res.status(400).json({ error: "0x address required" }); const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`); const d = await r.json(); const p = d.pairs?.[0]; if (!p) return res.json({ safe: false, risk_score: 95, flags: ["no_liquidity"], liquidity_usd: 0, honeypot: true }); const liq = p.liquidity?.usd||0; const age = p.pairCreatedAt ? (Date.now()-new Date(p.pairCreatedAt).getTime())/3600000 : 0; const bt = p.fees?.buy||0; const st = p.fees?.sell||0; let rs = 0; const f = []; if(liq<10000){rs+=30;f.push("low_liquidity")} if(age<24){rs+=25;f.push("new_pair")} if(st>10){rs+=25;f.push("high_sell_tax")} const hp = st>90||(st>50&&bt<5); if(hp){rs+=30;f.push("honeypot")} res.json({safe:Math.min(100,rs)<40,risk_score:Math.min(100,rs),flags:f,liquidity_usd:liq,pair_age_hours:Math.round(age),buy_tax:bt,sell_tax:st,honeypot:hp}); } catch(e){res.status(500).json({error:e.message})} });
app.post("/v1/wallet-risk", async (req, res) => { try { const { address } = req.body; if (!address?.startsWith("0x")) return res.status(400).json({ error: "0x address required" }); let txns=0,first=null,last=null; const rf=[]; try{const r=await fetch(`https://blockscout.com/eth/mainnet/api?module=account&action=txlist&address=${address}&sort=desc&page=1&offset=5`);const d=await r.json();txns=(d.result||[]).length;if(txns>0){first=new Date(parseInt(d.result[txns-1].timeStamp)*1000).toISOString().split("T")[0];last=new Date(parseInt(d.result[0].timeStamp)*1000).toISOString().split("T")[0]}}catch{} if(txns===0)rf.push("no_transactions"); let ofac=false; try{const r=await fetch("https://api.ofac-api.com/v4/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({address:address.toLowerCase()})});if(r.ok){const d=await r.json();ofac=(d.matches||[]).length>0;if(ofac)rf.push("ofac_sanctioned")}}catch{} const rl=ofac?"critical":rf.includes("very_new_address")?"high":rf.length>2?"medium":"low"; res.json({risk_level:rl,ofac_sanctioned:ofac,scam_flagged:ofac,total_txns:txns,first_seen:first||"unknown",last_active:last||"unknown",risk_factors:rf}); } catch(e){res.status(500).json({error:e.message})} });
app.post("/v1/web-scrape", async (req, res) => { try { const { url, max_chars=5000 } = req.body; if (!url?.startsWith("http")) return res.status(400).json({ error: "URL required" }); const r = await fetch(`https://r.jina.ai/${url}`, { headers: {"Accept":"text/plain","X-Return-Format":"text"}, signal: AbortSignal.timeout(15000) }); if(!r.ok) return res.status(502).json({error:`Jina error: ${r.status}`}); const t = await r.text(); const lines = t.split("\n"); const title = lines.find(l=>l.startsWith("Title:"))?.replace("Title:","").trim()||""; const pub = lines.find(l=>l.startsWith("Published Time:"))?.replace("Published Time:","").trim()||""; const content = t.replace(/^Title:.*$/m,"").replace(/^URL Source:.*$/m,"").replace(/^Published Time:.*$/m,"").trim().slice(0,max_chars); res.json({title,content,word_count:content.split(/\s+/).filter(Boolean).length,published:pub}); } catch(e){res.status(500).json({error:e.message})} });
app.post("/v1/crypto-price", async (req, res) => { try { const { symbols=["bitcoin"], vs_currency="usd" } = req.body; if(!Array.isArray(symbols)) return res.status(400).json({error:"symbols array required"}); const ids=symbols.map(s=>s.toLowerCase().replace(/\s+/g,"-")).join(","); const r=await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=${vs_currency}&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`,{signal:AbortSignal.timeout(10000)}); if(!r.ok) return res.status(502).json({error:"CoinGecko error"}); const d=await r.json(); const prices={}; for(const[id,v] of Object.entries(d)){prices[id]={price:v[vs_currency],change_24h:v[`${vs_currency}_24h_change`],market_cap:v[`${vs_currency}_market_cap`],volume:v[`${vs_currency}_24h_vol`]}} res.json({prices}); } catch(e){res.status(500).json({error:e.message})} });
app.post("/v1/image-describe", async (req, res) => { try { const { image_url, detail="brief" } = req.body; if(!image_url) return res.status(400).json({error:"image_url required"}); const prompt=detail==="detailed"?"Describe this image in detail.":"Briefly describe this image in 2-3 sentences."; const r=await fetch(`${OLLAMA_URL}/api/chat`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"moondream:latest",messages:[{role:"user",content:prompt,images:[image_url]}],stream:false}),signal:AbortSignal.timeout(30000)}); if(!r.ok) return res.status(502).json({error:"Vision model error"}); const d=await r.json(); const desc=d.message?.content||"Could not describe"; res.json({description:desc,objects:[],text_found:desc.includes("text")?"See description":"None"}); } catch(e){res.status(500).json({error:e.message})} });
app.post("/v1/defi-yields", async (req, res) => { try { const { protocol, chain="ethereum" } = req.body; const r=await fetch("https://yields.llama.fi/pools",{signal:AbortSignal.timeout(10000)}); if(!r.ok) return res.status(502).json({error:"DeFiLlama error"}); const d=await r.json(); let p=d.data||[]; if(protocol)p=p.filter(x=>x.project?.toLowerCase()===protocol.toLowerCase()); p=p.filter(x=>x.chain?.toLowerCase()===chain.toLowerCase()).sort((a,b)=>(b.tvlUsd||0)-(a.tvlUsd||0)).slice(0,10); res.json({yields:p.map(x=>({protocol:x.project,apy:x.apy,tvl:x.tvlUsd,chain:x.chain,category:x.category}))}); } catch(e){res.status(500).json({error:e.message})} });
app.post("/v1/threat-intel", async (req, res) => { try { const { cve_id, keyword } = req.body; if(!cve_id&&!keyword) return res.status(400).json({error:"cve_id or keyword required"}); const url=cve_id?`https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${cve_id}`:`https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${encodeURIComponent(keyword)}&resultsPerPage=5`; const r=await fetch(url,{signal:AbortSignal.timeout(15000)}); if(!r.ok) return res.status(502).json({error:"NVD error"}); const d=await r.json(); const v=(d.vulnerabilities||[]).map(v=>{const c=v.cve;return{cve_id:c.id,severity:c.metrics?.cvssMetricV31?.[0]?.cvssData?.baseSeverity||"UNKNOWN",description:c.descriptions?.find(x=>x.lang==="en")?.value||""}}); res.json(v.length===1?v[0]:{results:v}); } catch(e){res.status(500).json({error:e.message})} });
app.post("/v1/sanctions-screen", async (req, res) => { try { const { name, type="individual" } = req.body; if(!name) return res.status(400).json({error:"name required"}); const r=await fetch("https://api.ofac-api.com/v4/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,type}),signal:AbortSignal.timeout(10000)}); if(!r.ok) return res.status(502).json({error:"OFAC error"}); const d=await r.json(); const m=d.matches||[]; res.json({sanctioned:m.length>0,lists:[...new Set(m.map(x=>x.list||"SDN"))],match_score:m[0]?.score||0}); } catch(e){res.status(500).json({error:e.message})} });
app.post("/v1/market-intel", async (req, res) => { try { const { country="US" } = req.body; const cm={US:"USA",UK:"GBR",EU:"EMU",JP:"JPN",CN:"CHN"}; const code=cm[country.toUpperCase()]||country.toUpperCase(); const inds=["NY.GDP.MKTP.CD","FP.CPI.TOTL.ZG","FR.INR.RINR","SL.UEM.TOTL.ZS"]; const results={}; for(const ind of inds){try{const r=await fetch(`https://api.worldbank.org/v2/country/${code}/indicator/${ind}?format=json&date=2020:2025&per_page=5`,{signal:AbortSignal.timeout(8000)});if(r.ok){const d=await r.json();const v=(d[1]||[]).filter(x=>x.value!==null);if(v.length>0)results[ind]={value:v[0].value,period:v[0].date}}}catch{}} res.json({country,data:results}); } catch(e){res.status(500).json({error:e.message})} });
app.post("/v1/on-chain-events", async (req, res) => { try { const { address, limit=10 } = req.body; if(!address?.startsWith("0x")) return res.status(400).json({error:"0x address required"}); const r=await fetch(`https://blockscout.com/eth/mainnet/api?module=account&action=txlist&address=${address}&sort=desc&page=1&offset=${Math.min(limit,20)}`,{signal:AbortSignal.timeout(10000)}); if(!r.ok) return res.status(502).json({error:"Blockscout error"}); const d=await r.json(); res.json({events:(d.result||[]).map(tx=>({type:parseInt(tx.value)>0?"transfer":"call",from:tx.from,to:tx.to,value:(parseInt(tx.value)/1e18).toFixed(6)+" ETH",timestamp:new Date(parseInt(tx.timeStamp)*1000).toISOString(),tx_hash:tx.hash}))}); } catch(e){res.status(500).json({error:e.message})} });
app.post("/v1/content-safety", async (req, res) => { try { const { text } = req.body; if(!text) return res.status(400).json({error:"text required"}); const r=await fetch(`${OLLAMA_URL}/api/chat`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"llama3.2:3b",messages:[{role:"user",content:`Analyze for safety. Return JSON: {safe:boolean,flags:[],pii_found:[],toxicity_score:0-1}. Text: ${text.slice(0,3000)}`}],stream:false}),signal:AbortSignal.timeout(20000)}); if(!r.ok) return res.status(502).json({error:"Ollama error"}); const d=await r.json(); try{const m=d.message?.content?.match(/\{[^{}]*\}/s);if(m)return res.json(JSON.parse(m[0]))}catch{} res.json({safe:true,flags:[],pii_found:[],toxicity_score:0}); } catch(e){res.status(500).json({error:e.message})} });
app.post("/v1/agent-reputation", async (req, res) => { try { const { endpoint_url } = req.body; if(!endpoint_url) return res.status(400).json({error:"endpoint_url required"}); const s=Date.now(); const r=await fetch(endpoint_url,{method:"HEAD",signal:AbortSignal.timeout(10000)}); const ms=Date.now()-s; let score=50; if(r.status>=200&&r.status<300)score+=20; if(r.status===402)score+=15; if(ms<500)score+=15; if(r.headers.get("x402-version"))score+=10; const grade=score>=80?"A":score>=60?"B":score>=40?"C":"D"; res.json({score:Math.min(100,score),grade,verified:r.status===402,response_time_ms:ms}); } catch(e){res.status(500).json({error:e.message})} });
app.post("/v1/legal-lookup", async (req, res) => { try { const { query, jurisdiction="US" } = req.body; if(!query) return res.status(400).json({error:"query required"}); const r=await fetch(`https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(query)}&jurisdiction_code=${jurisdiction.toLowerCase()}&per_page=5`,{signal:AbortSignal.timeout(10000)}); if(!r.ok) return res.status(502).json({error:"OpenCorporates error"}); const d=await r.json(); res.json({results:(d.results?.companies||[]).map(c=>({name:c.company.name,id:c.company.company_number,status:c.company.current_status,jurisdiction:c.company.jurisdiction_code}))}); } catch(e){res.status(500).json({error:e.message})} });
app.post("/v1/news-feed", async (req, res) => { try { const { query, limit=5 } = req.body; if(!query) return res.status(400).json({error:"query required"}); const r=await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`,{signal:AbortSignal.timeout(10000)}); if(!r.ok) return res.status(502).json({error:"News error"}); const t=await r.text(); const items=t.match(/<item>[\s\S]*?<\/item>/g)||[]; res.json({articles:items.slice(0,limit).map(i=>({title:(i.match(/<title>([\s\S]*?)<\/title>/)?.[1]||"").replace(/<!\[CDATA\[|\]\]>/g,""),source:"Google News",url:(i.match(/<link>([\s\S]*?)<\/link>/)?.[1]||"").replace(/<!\[CDATA\[|\]\]>/g,""),published:i.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]||""}))}); } catch(e){res.status(500).json({error:e.message})} });
app.post("/v1/weather-data", async (req, res) => { try { const { location, days=1 } = req.body; if(!location) return res.status(400).json({error:"location required"}); let lat,lon; if(location.includes(",")){[lat,lon]=location.split(",").map(Number)}else{const g=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`,{signal:AbortSignal.timeout(8000)});if(!g.ok)return res.status(502).json({error:"Geocoding failed"});const gd=await g.json();if(!gd.results?.length)return res.status(404).json({error:"Location not found"});lat=gd.results[0].latitude;lon=gd.results[0].longitude} const w=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&timezone=auto&forecast_days=${Math.min(days,7)}`,{signal:AbortSignal.timeout(8000)}); if(!w.ok)return res.status(502).json({error:"Weather error"}); const d=await w.json(); const wc={0:"Clear",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",51:"Drizzle",61:"Rain",63:"Moderate rain",65:"Heavy rain",71:"Snow",80:"Showers",95:"Thunderstorm"}; res.json({location:`${lat}, ${lon}`,current:{temp:d.current?.temperature_2m,humidity:d.current?.relative_humidity_2m,wind:d.current?.wind_speed_10m,conditions:wc[d.current?.weather_code]||"Unknown"},forecast:(d.daily?.time||[]).map((date,i)=>({date,high:d.daily.temperature_2m_max?.[i],low:d.daily.temperature_2m_min?.[i],precip:d.daily.precipitation_sum?.[i],conditions:wc[d.daily.weather_code?.[i]]||"Unknown"}))}); } catch(e){res.status(500).json({error:e.message})} });

// ========== NEW SERVICES (Sep 2026): demand-driven additions ==========
// Wallet-scoped persistent memory (the agent statefulness wedge).
const MEMORY_FILE = path.join(process.cwd(), "data", "memory.json");
let memoryStore = {};
try { memoryStore = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8")); } catch { memoryStore = {}; }
let memoryDirty = false;
setInterval(() => {
  if (!memoryDirty) return;
  memoryDirty = false;
  try {
    fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true });
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memoryStore));
  } catch (e) { console.error("[memory] persist failed:", e.message); }
}, 5000).unref();

const cleanHtml = (s) => String(s || "")
  .replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ").trim();

app.post("/v1/web-search", async (req, res) => { try {
  const { query, max_results = 8 } = req.body || {};
  if (!query || typeof query !== "string") return res.status(400).json({ error: "query required" });
  const r = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0" },
    body: new URLSearchParams({ q: query.slice(0, 400) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) return res.status(502).json({ error: `DuckDuckGo error: ${r.status}` });
  const t = await r.text();
  const links = [...t.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const snips = [...t.matchAll(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];
  const results = links.slice(0, Math.min(Math.max(max_results, 1), 10)).map((m, i) => {
    let url = m[1];
    const uq = url.match(/[?&]uddg=([^&]+)/);
    if (uq) { try { url = decodeURIComponent(uq[1]); } catch {} }
    return { title: cleanHtml(m[2]), url, snippet: cleanHtml(snips[i] ? snips[i][1] : "") };
  }).filter((o) => o.url && o.url.startsWith("http"));
  if (!results.length) return res.status(502).json({ error: "no results parsed (upstream layout may have changed)" });
  res.json({ query, results, count: results.length });
  record({ ts: new Date().toISOString(), service: "web-search", status: "paid", usd: 0.01, payer: payerOf(req) });
} catch (e) { res.status(500).json({ error: e.message }); } });

app.post("/v1/memory", async (req, res) => { try {
  const { action = "get", key, value, namespace = "default" } = req.body || {};
  if (!["get", "set", "delete", "list"].includes(action)) return res.status(400).json({ error: "action must be get|set|delete|list" });
  if (key !== undefined && (typeof key !== "string" || key.length > 200)) return res.status(400).json({ error: "key must be a string of at most 200 chars" });
  const payer = payerOf(req);
  if (!payer || payer === "unknown") return res.status(400).json({ error: "payer identity unavailable; memory is keyed to the paying wallet" });
  const bucketKey = `${payer}::${String(namespace).slice(0, 50)}`;
  if (action === "set") {
    if (value === undefined) return res.status(400).json({ error: "value required for set" });
    const vs = typeof value === "string" ? value : JSON.stringify(value);
    if (vs.length > 100000) return res.status(400).json({ error: "value too large (max 100KB serialized)" });
    if (!memoryStore[bucketKey]) memoryStore[bucketKey] = {};
    const bucket = memoryStore[bucketKey];
    if (bucket[key] === undefined && Object.keys(bucket).length >= 500) return res.status(400).json({ error: "namespace full (max 500 keys)" });
    bucket[key] = value;
    memoryDirty = true;
    return res.json({ ok: true, action: "set", key, namespace, stored_chars: vs.length });
  }
  const bucket = memoryStore[bucketKey] || {};
  if (action === "get") {
    if (!(key in bucket)) return res.status(404).json({ error: "key not found", key, namespace });
    return res.json({ ok: true, key, namespace, value: bucket[key] });
  }
  if (action === "delete") {
    if (!(key in bucket)) return res.status(404).json({ error: "key not found", key, namespace });
    delete bucket[key];
    memoryDirty = true;
    return res.json({ ok: true, action: "delete", key, namespace });
  }
  return res.json({ ok: true, action: "list", namespace, keys: Object.keys(bucket), count: Object.keys(bucket).length });
} catch (e) { res.status(500).json({ error: e.message }); } });

app.post("/v1/geocode", async (req, res) => { try {
  const { query, reverse = false } = req.body || {};
  if (!query || typeof query !== "string") return res.status(400).json({ error: "query required (place name or 'lat,lon')" });
  if (reverse || /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(query.trim())) {
    const [lat, lon] = query.split(",").map((s) => parseFloat(s.trim()));
    if (Number.isNaN(lat) || Number.isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return res.status(400).json({ error: "invalid coordinates" });
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&addressdetails=1`, { headers: { "User-Agent": "AgentPay/1.0 (x402 geocoding service)" }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return res.status(502).json({ error: "Nominatim error" });
    const d = await r.json();
    record({ ts: new Date().toISOString(), service: "geocode", status: "paid", usd: 0.005, payer: payerOf(req) });
    return res.json({ query, reverse: true, address: d.display_name || null, location: { lat: parseFloat(d.lat), lon: parseFloat(d.lon) }, type: d.type, city: d.address?.city || d.address?.town || d.address?.village || null, country: d.address?.country || null, country_code: (d.address?.country_code || "").toUpperCase() || null });
  }
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=5&language=en&format=json`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) return res.status(502).json({ error: "Open-Meteo geocoding error" });
  const d = await r.json();
  const results = (d.results || []).map((x) => ({ name: x.name, country: x.country, country_code: x.country_code, admin1: x.admin1, lat: x.latitude, lon: x.longitude, population: x.population, timezone: x.timezone }));
  record({ ts: new Date().toISOString(), service: "geocode", status: "paid", usd: 0.005, payer: payerOf(req) });
  res.json({ query, reverse: false, results, count: results.length });
} catch (e) { res.status(500).json({ error: e.message }); } });

app.post("/v1/eth-gas", async (req, res) => { try {
  const r = await fetch("https://ethgasprice.org/api/gas", { signal: AbortSignal.timeout(10000) });
  if (!r.ok) return res.status(502).json({ error: "gas oracle error" });
  const d = await r.json();
  const g = d?.data;
  if (!g) return res.status(502).json({ error: "gas data unavailable" });
  record({ ts: new Date().toISOString(), service: "eth-gas", status: "paid", usd: 0.003, payer: payerOf(req) });
  res.json({ eth_usd: g.priceUSD, gwei: { rapid: g.rapid, fast: g.fast, standard: g.standard, slow: g.slow }, updated_at: new Date().toISOString() });
} catch (e) { res.status(500).json({ error: e.message }); } });

app.post("/v1/prediction-market", async (req, res) => { try {
  const { query, limit = 5 } = req.body || {};
  if (!query || typeof query !== "string") return res.status(400).json({ error: "query required" });
  const r = await fetch(`https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(query.slice(0, 200))}&limit_per_type=5&events_status=active`, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) return res.status(502).json({ error: `Polymarket error: ${r.status}` });
  const d = await r.json();
  const parseJson = (v) => { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch { return v; } };
  const events = (d.events || []).slice(0, Math.min(Math.max(limit, 1), 10)).map((e) => ({
    title: e.title,
    slug: e.slug,
    end_date: e.endDate,
    markets: (e.markets || []).slice(0, 5).map((m) => {
      const outcomes = parseJson(m.outcomes);
      const prices = parseJson(m.outcomePrices);
      const o = {};
      if (Array.isArray(outcomes) && Array.isArray(prices)) outcomes.forEach((name, i) => { o[name] = parseFloat(prices[i]); });
      return { question: m.question, outcomes: o, volume: m.volume };
    }),
  }));
  record({ ts: new Date().toISOString(), service: "prediction-market", status: "paid", usd: 0.01, payer: payerOf(req) });
  res.json({ query, events, count: events.length });
} catch (e) { res.status(500).json({ error: e.message }); } });

app.post("/v1/deep-research", async (req, res) => { try {
  const { topic, depth = "standard" } = req.body || {};
  if (!topic || typeof topic !== "string") return res.status(400).json({ error: "topic required" });
  const perRound = depth === "deep" ? 8 : 5;
  const readCap = depth === "deep" ? 7 : 5;
  const steps = [];
  const sr = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0" },
    body: new URLSearchParams({ q: topic.slice(0, 400) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!sr.ok) return res.status(502).json({ error: `search failed: ${sr.status}` });
  const st = await sr.text();
  const links = [...st.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].slice(0, perRound).map((m) => {
    let url = m[1];
    const uq = url.match(/[?&]uddg=([^&]+)/);
    if (uq) { try { url = decodeURIComponent(uq[1]); } catch {} }
    return { url, title: m[2].replace(/<[^>]+>/g, "").trim() };
  }).filter((o) => o.url && o.url.startsWith("http"));
  steps.push({ step: "search", query: topic.slice(0, 200), results: links.length });
  if (!links.length) return res.status(502).json({ error: "no search results for this topic" });
  const reads = [];
  for (const src of links.slice(0, readCap)) {
    try {
      const pr = await fetch(`https://r.jina.ai/${src.url}`, { headers: { "Accept": "text/plain", "X-Return-Format": "text" }, signal: AbortSignal.timeout(20000) });
      if (!pr.ok) continue;
      const pt = (await pr.text()).replace(/^Title:.*$/m, "").replace(/^URL Source:.*$/m, "").replace(/^Published Time:.*$/m, "").trim().slice(0, depth === "deep" ? 9000 : 6000);
      if (pt.length > 200) reads.push({ url: src.url, title: src.title, content: pt });
    } catch {}
  }
  steps.push({ step: "read_sources", read: reads.length, attempted: Math.min(links.length, readCap) });
  if (!reads.length) return res.status(502).json({ error: "could not read any sources for this topic" });
  const corpus = reads.map((r, i) => `[S${i + 1}] ${r.title}\n${r.content}`).join("\n\n");
  const model = process.env.MODEL_RESEARCH || process.env.MODEL_EXTRACT || "gemma3:1b";
  const report = await ollamaChat(model, [
    { role: "system", content: "You are a research analyst. Write a thorough research report on the user's topic using ONLY the provided sources. Structure: ## Executive Summary (one paragraph), ## Key Findings (numbered bullets), ## Analysis (2-4 paragraphs), ## Conclusion. Cite sources inline as [S1], [S2] etc. matching the bracket numbers. End with ## Sources listing each cited source id with its title. Be factual; mark uncertainty clearly. Output markdown only." },
    { role: "user", content: `Topic: ${topic}\n\nSources:\n\n${corpus.slice(0, 60000)}` },
  ], 3000);
  const citations = reads.map((r, i) => ({ id: `S${i + 1}`, url: r.url, title: r.title }));
  record({ ts: new Date().toISOString(), service: "deep-research", status: "paid", usd: 0.25, payer: payerOf(req) });
  res.json({ topic, depth, report, citations, stats: { sources_read: reads.length, search_results: links.length, report_words: report.split(/\s+/).filter(Boolean).length }, steps });
} catch (e) {
  record({ ts: new Date().toISOString(), service: "deep-research", status: "error", usd: 0, error: String(e).slice(0, 200) });
  res.status(500).json({ error: e.message });
} });

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AgentPay listening on :${PORT}`);
  console.log(`  payTo:   ${PAY_TO}`);
  console.log(`  network: ${NETWORK} (${NETWORK === 'eip155:8453' ? 'Base mainnet' : 'Base Sepolia testnet'})`);
  console.log(`  facilitator: ${FACILITATOR}`);
});
