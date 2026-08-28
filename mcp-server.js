#!/usr/bin/env node
// mcp-server.js — MCP (Model Context Protocol) server for x402-shop services.
// Exposes summarize, classify-insurance, and extract as MCP tools via stdio transport.
// Each tool calls the x402 paywalled HTTP endpoint and handles payment automatically.
//
// Usage:
//   node mcp-server.js
//
// Environment:
//   SHOP_URL          - Base URL of the x402-shop server (default: https://yard-singer-minus-drain.trycloudflare.com)
//   BUYER_PRIVATE_KEY - Hex private key for USDC payments (required)
//   PAYMENT_NETWORK   - eip155 network identifier (default: eip155:84532 for Base Sepolia)

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

// ── Configuration ──────────────────────────────────────────────────────────────
const SHOP_URL = process.env.SHOP_URL || "https://agentpay.help";
const NETWORK = process.env.PAYMENT_NETWORK || "eip155:84532";
const PRIVATE_KEY = process.env.BUYER_PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error("[mcp-server] BUYER_PRIVATE_KEY is required. Set it in .env or export it.");
  process.exit(1);
}

// ── x402 Payment Client ────────────────────────────────────────────────────────
const signer = privateKeyToAccount(PRIVATE_KEY);
const client = x402Client.fromConfig({
  schemes: [{ network: "eip155:*", client: new ExactEvmScheme(signer) }],
});
const payFetch = wrapFetchWithPayment(globalThis.fetch, client);

console.error(`[mcp-server] wallet: ${signer.address}`);
console.error(`[mcp-server] shop:   ${SHOP_URL}`);
console.error(`[mcp-server] network: ${NETWORK}`);

// ── Helper: call a paywalled endpoint ──────────────────────────────────────────
async function callEndpoint(path, body) {
  const t0 = Date.now();
  const res = await payFetch(`${SHOP_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const errMsg = data?.error || `HTTP ${res.status}`;
    throw new Error(`${errMsg} (${ms}ms)`);
  }

  return { ...data, _latencyMs: ms };
}

// ── MCP Server ─────────────────────────────────────────────────────────────────
const server = new McpServer({
  name: "x402-shop",
  version: "1.0.0",
}, {
  capabilities: {
    tools: {},
  },
});

// ── Tool: summarize ────────────────────────────────────────────────────────────
server.tool(
  "summarize",
  "Summarize text using AI (200-20,000 chars). Returns a concise summary. Costs $0.01 USDC.",
  {
    text: z.string().min(200, "Text must be at least 200 characters").max(20000, "Text must be at most 20,000 characters"),
  },
  async ({ text }) => {
    try {
      const result = await callEndpoint("/v1/summarize", { text });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              summary: result.summary,
              words: result.words,
              cost: "$0.01 USDC",
              latencyMs: result._latencyMs,
            }, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: classify-insurance ───────────────────────────────────────────────────
server.tool(
  "classify-insurance",
  "Classify an insurance lead message: intent, urgency, line of business, confidence. Costs $0.02 USDC.",
  {
    text: z.string().min(10, "Text must be at least 10 characters").max(10000, "Text must be at most 10,000 characters"),
  },
  async ({ text }) => {
    try {
      const result = await callEndpoint("/v1/classify-insurance", { text });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ...result,
              cost: "$0.02 USDC",
              latencyMs: result._latencyMs,
            }, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: extract ──────────────────────────────────────────────────────────────
server.tool(
  "extract",
  "Extract structured key-value fields from raw text (emails, forms, documents). Costs $0.03 USDC.",
  {
    text: z.string().min(10, "Text must be at least 10 characters").max(20000, "Text must be at most 20,000 characters"),
    fields: z.array(z.string()).optional().describe("Optional: specific field names to extract (e.g. ['name', 'email', 'phone'])"),
  },
  async ({ text, fields }) => {
    try {
      const body = { text };
      if (fields && fields.length > 0) body.fields = fields;
      const result = await callEndpoint("/v1/extract", body);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ...result,
              cost: "$0.03 USDC",
              latencyMs: result._latencyMs,
            }, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Start ──────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[mcp-server] MCP server running on stdio — ready for Claude Desktop.");
