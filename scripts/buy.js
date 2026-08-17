#!/usr/bin/env node
// Buyer client: pays USDC via x402 and consumes a paywalled service.
// Usage: node scripts/buy.js [endpoint] [payloadFile]
import "dotenv/config";
import { readFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

const BASE = process.env.SHOP_URL || "http://127.0.0.1:4021";
const PK = process.env.BUYER_PK;
const endpoint = process.argv[2] || "/v1/summarize";
const payloadFile = process.argv[3];
const payload = payloadFile
  ? JSON.parse(readFileSync(payloadFile, "utf8"))
  : { text: "Machine Payments Protocol lets AI agents pay for API calls using the HTTP 402 status code. " +
      "It revives a status code reserved in 1998, allowing per-call micropayments in USDC without accounts or API keys. " +
      "Sellers wrap local models behind a 402 paywall; buyers attach signed payment to their request. " +
"Agents discover services, negotiate price, pay, and consume — all without human intervention." };

if (!PK) { console.error("set BUYER_PK in .env"); process.exit(1); }

const signer = privateKeyToAccount(PK);
console.log(`buyer wallet: ${signer.address}`);
console.log(`target:       ${BASE}${endpoint}`);

// --- 1. pre-payment balance (USDC on Base Sepolia) ---
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
const bal = await publicClient.readContract({
  address: USDC, abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] }],
  functionName: "balanceOf", args: [signer.address],
});
console.log(`USDC balance: ${Number(bal) / 1e6} USDC`);

// --- 2. unpaid request → expect 402 ---
const rawFetch = globalThis.fetch;
const r0 = await rawFetch(`${BASE}${endpoint}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
console.log(`\nunpaid request → HTTP ${r0.status} ${r0.status === 402 ? "(paywall active ✓)" : "(expected 402!)"}`);

// --- 3. wrap fetch with x402 payment and retry ---
const client = x402Client.fromConfig({
  schemes: [{ network: "eip155:*", client: new ExactEvmScheme(signer) }],
});
const payFetch = wrapFetchWithPayment(rawFetch, client);

const t0 = Date.now();
const r1 = await payFetch(`${BASE}${endpoint}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
const ms = Date.now() - t0;
const body = await r1.text();
console.log(`\npaid request → HTTP ${r1.status} in ${ms}ms`);
try { console.log(JSON.stringify(JSON.parse(body), null, 2).slice(0, 1500)); }
catch { console.log(body.slice(0, 1500)); }

// --- 4. post-payment balance ---
const bal2 = await publicClient.readContract({
  address: USDC, abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] }],
  functionName: "balanceOf", args: [signer.address],
});
console.log(`\nUSDC balance after: ${Number(bal2) / 1e6} USDC (spent ${((Number(bal) - Number(bal2)) / 1e6).toFixed(6)})`);

// --- 5. seller ledger ---
try {
  const s = await (await rawFetch(`${BASE}/stats`)).json();
  console.log(`\nseller stats: ${s.requests_paid} paid requests, gross $${s.gross_usd.toFixed(2)}`);
} catch {}
process.exit(r1.status === 200 ? 0 : 2);
