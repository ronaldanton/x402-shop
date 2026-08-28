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
      "POST /v1/token-safety": { accepts: [{ scheme: "exact", price: "$0.02", network: NETWORK, payTo: PAY_TO }], description: "Token safety check", mimeType: "application/json", serviceName: "AgentPay Token Safety", tags: ["crypto","safety","x402"], extensions: { bazaar: { info: { input: { type: "http", method: "POST", body: { address: "0x..." } }, output: { type: "json", example: { safe: "boolean", risk_score: "number" } } }, schema: {} } } },
      "POST /v1/wallet-risk": { accepts: [{ scheme: "exact", price: "$0.02", network: NETWORK, payTo: PAY_TO }], description: "Wallet risk screening", mimeType: "application/json", serviceName: "AgentPay Wallet Risk", tags: ["security","compliance","x402"], extensions: { bazaar: { info: { input: { type: "http", method: "POST", body: { address: "0x..." } }, output: { type: "json", example: { risk_level: "string" } } }, schema: {} } } },
      "POST /v1/web-scrape": { accepts: [{ scheme: "exact", price: "$0.01", network: NETWORK, payTo: PAY_TO }], description: "Web scraping", mimeType: "application/json", serviceName: "AgentPay Web Scrape", tags: ["data","web","x402"], extensions: { bazaar: { info: { input: { type: "http", method: "POST", body: { url: "string" } }, output: { type: "json", example: { title: "string", content: "string" } } }, schema: {} } } },
      "POST /v1/crypto-price": { accepts: [{ scheme: "exact", price: "$0.005", network: NETWORK, payTo: PAY_TO }], description: "Crypto prices", mimeType: "application/json", serviceName: "AgentPay Crypto Price", tags: ["crypto","price","x402"], extensions: { bazaar: { info: { input: { type: "http", method: "POST", body: { symbols: "string[]" } }, output: { type: "json", example: { prices: "object" } } }, schema: {} } } },
      "POST /v1/image-describe": { accepts: [{ scheme: "exact", price: "$0.03", network: NETWORK, payTo: PAY_TO }], description: "Vision AI", mimeType: "application/json", serviceName: "AgentPay Image Describe", tags: ["vision","image","x402"], extensions: { bazaar: { info: { input: { type: "http", method: "POST", body: { image_url: "string" } }, output: { type: "json", example: { description: "string" } } }, schema: {} } } },
      "POST /v1/defi-yields": { accepts: [{ scheme: "exact", price: "$0.01", network: NETWORK, payTo: PAY_TO }], description: "DeFi yields", mimeType: "application/json", serviceName: "AgentPay DeFi Yields", tags: ["defi","crypto","x402"], extensions: { bazaar: { info: { input: { type: "http", method: "POST", body: { protocol: "string" } }, output: { type: "json", example: { yields: "array" } } }, schema: {} } } },
      "POST /v1/threat-intel": { accepts: [{ scheme: "exact", price: "$0.02", network: NETWORK, payTo: PAY_TO }], description: "Threat intelligence", mimeType: "application/json", serviceName: "AgentPay Threat Intel", tags: ["security","cve","x402"], extensions: { bazaar: { info: { input: { type: "http", method: "POST", body: { cve_id: "string" } }, output: { type: "json", example: { cve_id: "string", severity: "string" } } }, schema: {} } } },
      "POST /v1/sanctions-screen": { accepts: [{ scheme: "exact", price: "$0.02", network: NETWORK, payTo: PAY_TO }], description: "Sanctions screening", mimeType: "application/json", serviceName: "AgentPay Sanctions Screen", tags: ["compliance","ofac","x402"], extensions: { bazaar: { info: { input: { type: "http", method: "POST", body: { name: "string" } }, output: { type: "json", example: { sanctioned: "boolean" } } }, schema: {} } } },
      "POST /v1/market-intel": { accepts: [{ scheme: "exact", price: "$0.02", network: NETWORK, payTo: PAY_TO }], description: "Market intelligence", mimeType: "application/json", serviceName: "AgentPay Market Intel", tags: ["economics","data","x402"], extensions: { bazaar: { info: { input: { type: "http", method: "POST", body: { country: "string" } }, output: { type: "json", example: { country: "string", data: "object" } } }, schema: {} } } },
      "POST /v1/on-chain-events": { accepts: [{ scheme: "exact", price: "$0.01", network: NETWORK, payTo: PAY_TO }], description: "On-chain events", mimeType: "application/json", serviceName: "AgentPay On-Chain Events", tags: ["blockchain","crypto","x402"], extensions: { bazaar: { info: { input: { type: "http", method: "POST", body: { address: "0x..." } }, output: { type: "json", example: { events: "array" } } }, schema: {} } } },
      "POST /v1/content-safety": { accepts: [{ scheme: "exact", price: "$0.02", network: NETWORK, payTo: PAY_TO }], description: "Content safety", mimeType: "application/json", serviceName: "AgentPay Content Safety", tags: ["safety","pii","x402"], extensions: { bazaar: { info: { input: { type: "http", method: "POST", body: { text: "string" } }, output: { type: "json", example: { safe: "boolean" } } }, schema: {} } } },
      "POST /v1/agent-reputation": { accepts: [{ scheme: "exact", price: "$0.01", network: NETWORK, payTo: PAY_TO }], description: "Agent reputation", mimeType: "application/json", serviceName: "AgentPay Agent Reputation", tags: ["trust","agent","x402"], extensions: { bazaar: { info: { input: { type: "http", method: "POST", body: { endpoint_url: "string" } }, output: { type: "json", example: { score: "number" } } }, schema: {} } } },
      "POST /v1/legal-lookup": { accepts: [{ scheme: "exact", price: "$0.03", network: NETWORK, payTo: PAY_TO }], description: "Legal lookup", mimeType: "application/json", serviceName: "AgentPay Legal Lookup", tags: ["legal","compliance","x402"], extensions: { bazaar: { info: { input: { type: "http", method: "POST", body: { query: "string" } }, output: { type: "json", example: { results: "array" } } }, schema: {} } } },
      "POST /v1/news-feed": { accepts: [{ scheme: "exact", price: "$0.005", network: NETWORK, payTo: PAY_TO }], description: "News feed", mimeType: "application/json", serviceName: "AgentPay News Feed", tags: ["news","data","x402"], extensions: { bazaar: { info: { input: { type: "http", method: "POST", body: { query: "string" } }, output: { type: "json", example: { articles: "array" } } }, schema: {} } } },
      "POST /v1/weather-data": { accepts: [{ scheme: "exact", price: "$0.005", network: NETWORK, payTo: PAY_TO }], description: "Weather data", mimeType: "application/json", serviceName: "AgentPay Weather Data", tags: ["weather","data","x402"], extensions: { bazaar: { info: { input: { type: "http", method: "POST", body: { location: "string" } }, output: { type: "json", example: { location: "string", current: "object" } } }, schema: {} } } },
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
<meta property="og:image" content="https://agentpay.help/branding/final/og-image.png"><meta property="og:url" content="https://agentpay.help">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="AgentPay"><meta name="twitter:description" content="22 pay-per-call AI services via x402"><meta name="twitter:image" content="https://agentpay.help/branding/final/og-image.png">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"AgentPay","description":"22 pay-per-call AI microservices via x402","url":"https://agentpay.help","applicationCategory":"DeveloperApplication","author":{"@type":"Person","name":"Ronald Anton"}}</script>
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AgentPay listening on :${PORT}`);
  console.log(`  payTo:   ${PAY_TO}`);
  console.log(`  network: ${NETWORK} (${NETWORK === 'eip155:8453' ? 'Base mainnet' : 'Base Sepolia testnet'})`);
  console.log(`  facilitator: ${FACILITATOR}`);
});
