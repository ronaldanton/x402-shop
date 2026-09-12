# AgentPay — Hacker News "Show HN" Post

## Title
Show HN: AgentPay – Pay-per-call AI microservices via x402 (HTTP 402)

## URL
https://agentpay.help

## First Comment (post immediately after submission)

I built AgentPay — a marketplace of 22 AI microservices where payment happens at the HTTP layer using the x402 protocol (HTTP 402 Payment Required).

**The core idea:** No accounts, no API keys, no subscriptions. Your wallet is your auth.

**How it works:**
1. POST to any endpoint (e.g., `/v1/summarize`)
2. Server responds HTTP 402 with payment terms (amount, USDC recipient, Base chain)
3. Your x402 client signs a USDC transfer
4. Retry with payment proof → get your result

**Available services (22 endpoints):**
- Text: summarize ($0.01), sentiment ($0.02), translate ($0.03), extract ($0.03)
- Code: code-review ($0.05)
- Vision: image-describe ($0.03)
- Crypto/DeFi: token-safety ($0.02), wallet-risk ($0.02), crypto-price ($0.005), defi-yields ($0.01), on-chain-events ($0.01)
- Compliance: sanctions-screen ($0.02), content-safety ($0.02), threat-intel ($0.02)
- Data: web-scrape ($0.01), news-feed ($0.005), weather-data ($0.005), market-intel ($0.02), legal-lookup ($0.03)
- Insurance: classify-insurance ($0.02), insurance-analysis ($0.10)
- Meta: agent-reputation ($0.01)

**Why x402 instead of API keys:**
- Micropayments ($0.005) are viable on Base L2 — impossible with credit card processing
- Agents can discover and use services without human account setup
- Payment naturally rate-limits — no need for artificial rate limit management
- Wallet address is a stable identity without account provisioning

**Machine-readable discovery:**
- x402 catalog: `/.well-known/x402`
- Agent card: `/.well-known/agent.json`
- llms.txt: `/llms.txt`
- OpenAPI: `/openapi.json`

There's also an MCP server (`npx github:ronaldanton/x402-shop mcp-server.js`) that wraps all endpoints for use with Claude Desktop, Cursor, and other MCP clients.

Source: https://github.com/ronaldanton/x402-shop (Apache-2.0)

Curious what HN thinks — is "wallet as auth" practical, or do we still need traditional API keys alongside it?

## Follow-up Comment (if discussion gets traction)

To address some common questions:

**"Why not just use Stripe + API keys?"**
At $0.005–$0.10 per call, Stripe's per-transaction fee eats 30%+ of revenue. Crypto micropayments on Base L2 have negligible fees. Also, for AI agents calling services autonomously, the account creation + key management flow is a blocker — agents can't fill out signup forms.

**"What about refunds/disputes?"**
This is genuinely unsolved. Current model is: you pay, you get the result. No refund mechanism. For $0.01 calls this is probably fine; for $0.10 calls it's more questionable. Thinking about escrow patterns.

**"Is this production-ready?"**
It's live and processing real payments. The x402 facilitator (payai.network) handles payment verification. But it's early — I'd call it beta. The source is Apache-2.0 if you want to run your own instance.

**"Why Base specifically?"**
Low gas fees + USDC liquidity + EIP-1559 fee market. Any EVM L2 would work; Base just has the best USDC infrastructure right now.
