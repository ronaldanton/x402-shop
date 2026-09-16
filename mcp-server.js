#!/usr/bin/env node
// mcp-server.js — stdio MCP (Model Context Protocol) server for AgentPay.
//
// Exposes the full AgentPay catalog (28 pay-per-call AI microservices) as MCP
// tools over stdio, for Claude Desktop, Cursor, VS Code, Codex, Gemini CLI and
// any other stdio MCP host.
//
// Usage:
//   node mcp-server.js                      # catalog-only mode (no wallet needed)
//   BUYER_PRIVATE_KEY=0x... node mcp-server.js   # pays each call from that wallet
//
// Environment:
//   SHOP_URL          - AgentPay seller base URL (default: https://agentpay.help)
//   BUYER_PRIVATE_KEY - hex private key of a funded Base wallet (optional: without
//                       it the server still starts and lists every tool, and tools
//                       return the live x402 payment challenge for the caller to sign)
//   PAYMENT_NETWORK   - informational network label (default: eip155:8453, Base mainnet)
//
// Discovery/build note: directory crawlers (Glama, Smithery, npm, container builds)
// start this process to enumerate tools before any wallet exists, so a missing key
// must never abort startup.

import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, createPay } from "./src/mcp-http.js";
import { SERVICES } from "./src/services.js";

const SHOP_URL = process.env.SHOP_URL || "https://agentpay.help";
const NETWORK = process.env.PAYMENT_NETWORK || "eip155:8453";
const RAW_KEY = process.env.BUYER_PRIVATE_KEY;
const PRIVATE_KEY = RAW_KEY ? (RAW_KEY.startsWith("0x") ? RAW_KEY : `0x${RAW_KEY}`) : undefined;

if (!PRIVATE_KEY) {
  console.error(
    `[mcp-server] BUYER_PRIVATE_KEY not set — catalog-only mode. All ${SERVICES.length} tools are listed; each call returns the live x402 payment challenge (USD-coin on Base) for the caller to sign.`
  );
}

const pay = createPay({ buyerKey: PRIVATE_KEY });

const server = createMcpServer({
  services: SERVICES,
  baseUrl: SHOP_URL,
  pay,
  publicBase: SHOP_URL,
});

console.error(`[mcp-server] shop:    ${SHOP_URL}`);
console.error(`[mcp-server] network: ${NETWORK}`);
console.error(`[mcp-server] tools:   ${SERVICES.length}`);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[mcp-server] MCP server running on stdio — ready for Claude Desktop.");
