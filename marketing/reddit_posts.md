# AgentPay — Reddit Posts (Copy-Paste Ready)

---

## r/mcp (Model Context Protocol)

**Title:** I built an MCP server that wraps 22 paid AI microservices with x402 — no API keys, wallet is auth

**Body:**

Hey r/mcp,

I've been exploring how MCP servers can interface with paid services, and I built something I think this community would find interesting: **AgentPay** — an MCP server that exposes 22 AI microservices, each behind the x402 (HTTP 402 Payment Required) protocol.

**What it does:**
- Connect any MCP-compatible client (Claude Desktop, Cursor, etc.) to AI services like summarization, sentiment analysis, code review, translation, image description, and more
- When you call an endpoint, the server responds with HTTP 402 + payment instructions — your wallet pays in USDC on Base automatically
- No API keys, no accounts, no subscriptions — your wallet *is* your identity

**How to use it:**
```
npx github:ronaldanton/x402-shop mcp-server.js
```
Set `SHOP_URL=https://agentpay.help` and `BUYER_PRIVATE_KEY=<your hex key>`.

**What's available:**
- Summarize text ($0.01) • Sentiment analysis ($0.02) • Code review ($0.05)
- Translation ($0.03) • Image description ($0.03) • Web scraping ($0.01)
- Token safety checks ($0.02) • DeFi yields ($0.01) • Crypto prices ($0.005)
- Threat intel ($0.02) • Market data ($0.02) • And more — 22 endpoints total

**Why this matters for MCP:**
The MCP ecosystem is mostly about connecting to free/local tools. AgentPay demonstrates that paid, hosted microservices can work the same way — the x402 protocol handles payment at the HTTP layer, so the MCP server just needs to forward requests and handle the 402 dance.

Machine-readable discovery:
- x402 catalog: `https://agentpay.help/.well-known/x402`
- Agent card: `https://agentpay.help/.well-known/agent.json`
- llms.txt: `https://agentpay.help/llms.txt`

Source: [GitHub](https://github.com/ronaldanton/x402-shop) (Apache-2.0)

Curious what you all think — especially about the x402-as-auth pattern for MCP servers.

---

## r/aiagents

**Title:** Pay-per-call AI microservices for agents — 22 endpoints, $0.005–$0.10 per call, no API keys needed

**Body:**

If you're building AI agents, you've probably hit this problem: your agent needs to call external services (summarize text, check sentiment, scrape a page, analyze code), but every service wants a subscription, an API key, and rate limits.

I built **AgentPay** to solve this differently. It's a collection of 22 AI microservices where:
- **Payment is the auth** — no accounts, no API keys. Your wallet (USDC on Base) is your identity.
- **Pay only what you use** — $0.005 to $0.10 per call. No minimums, no monthly fees.
- **Agent-native discovery** — endpoints are described in `agent.json`, `x402` catalog, and `llms.txt` formats so agents can discover and call them autonomously.

**The x402 flow for agents:**
1. Agent POSTs to an endpoint
2. Gets HTTP 402 with payment terms (amount, recipient, network)
3. Agent's x402 client signs a USDC transfer
4. Retries with payment proof → gets the result

This means any agent with a funded wallet can call these services without pre-registration.

**Available services include:**
| Service | Price | What it does |
|---------|-------|-------------|
| summarize | $0.01 | 250-word summary of any text |
| sentiment | $0.02 | Positive/negative/neutral + emotions |
| code-review | $0.05 | Bugs, security, performance analysis |
| translate | $0.03 | Any language |
| image-describe | $0.03 | Vision AI on any image URL |
| token-safety | $0.02 | Rug pull / honeypot detection |
| wallet-risk | $0.02 | OFAC screening, scam flags |
| web-scrape | $0.01 | Clean text extraction from URLs |
| defi-yields | $0.01 | APY, TVL, protocol data |
| crypto-price | $0.005 | Real-time prices |

There's also an MCP server that wraps all of these, so agents built on MCP can use them natively.

Live: https://agentpay.help
Source: https://github.com/ronaldanton/x402-shop

---

## r/ethereum

**Title:** I built a pay-per-call AI API marketplace on Base — USDC micropayments via HTTP 402, no API keys

**Body:**

I've been thinking about what "internet-native payments" actually look like in practice, and I built **AgentPay** as an experiment: a marketplace of 22 AI microservices where payment happens at the HTTP layer using the x402 protocol.

**How it works:**
- You make a POST request to any endpoint (e.g., `/v1/summarize`)
- Server responds `HTTP 402 Payment Required` with payment instructions
- Your client signs a USDC transfer on Base (eip155:8453)
- You retry with the payment proof → get your result

**No accounts, no API keys, no subscriptions.** Your wallet address is your identity. You pay exactly what each call costs — ranging from $0.005 (crypto prices) to $0.10 (full insurance analysis bundle).

**Why Base + USDC?**
- Low gas fees make $0.005 payments viable
- USDC is stable — no ETH price volatility in your API costs
- Settlement is on-chain and verifiable

**What's available:**
22 endpoints covering text analysis, code review, translation, image description, token safety checks, DeFi yield data, wallet risk screening, sanctions checks, and more.

The x402 facilitator (https://facilitator.payai.network) handles payment verification, so the server doesn't need to run its own node.

**For builders:**
- OpenAPI spec: https://agentpay.help/openapi.json
- x402 catalog: https://agentpay.help/.well-known/x402
- Agent card: https://agentpay.help/.well-known/agent.json
- Source: https://github.com/ronaldanton/x402-shop (Apache-2.0)

Is this the kind of thing x402 was designed for? Would love feedback from the ETH ecosystem.

---

## r/cryptocurrency

**Title:** Forget subscriptions — this AI API marketplace lets you pay $0.005 per call with USDC, no account needed

**Body:**

Tired of every AI service wanting $20/month when you only need it occasionally? I built **AgentPay** — a marketplace of 22 AI microservices where you pay per call using USDC on Base.

**The concept:**
- No accounts, no API keys, no subscriptions
- Your crypto wallet IS your login
- Each API call costs $0.005 to $0.10 — paid in USDC on Base
- Payment happens at the HTTP layer (x402 protocol)

**What you can buy per-call:**
- Text summarization — $0.01
- Sentiment analysis — $0.02
- Code review — $0.05
- Translation (any language) — $0.03
- Image description — $0.03
- Token safety check (rug pull detection) — $0.02
- Wallet risk screening — $0.02
- DeFi yield data — $0.01
- Crypto prices — $0.005
- And 13 more services

**How payment works:**
1. Call the API
2. Get HTTP 402 with payment terms
3. Sign a USDC transfer
4. Get your result

No pre-loading credits, no monthly bills. Pay exactly what you use.

**Why this matters:**
Crypto micropayments for API access is one of those "this is what crypto was built for" use cases. No credit card processing fees eating into $0.005 transactions. No account management overhead. Just wallet-to-wallet value transfer.

Live: https://agentpay.help
Source: https://github.com/ronaldanton/x402-shop

---

## r/defi

**Title:** DeFi yield data API — pay $0.01 per call with USDC, no API key, via x402 protocol

**Body:**

I built an API endpoint that returns DeFi yield data (APY, TVL, protocol info) and it costs $0.01 per call, paid in USDC on Base.

It's part of **AgentPay** — a larger collection of 22 AI microservices all behind the x402 (HTTP 402) protocol. But the DeFi-specific endpoints are what this sub might care about:

- **`/v1/defi-yields`** ($0.01) — APY, TVL, protocol info by protocol/chain
- **`/v1/crypto-price`** ($0.005) — Real-time prices for BTC, ETH, SOL + more
- **`/v1/token-safety`** ($0.02) — Rug pull risk, honeypot detection, liquidity analysis
- **`/v1/wallet-risk`** ($0.02) — OFAC sanctions, scam flags, transaction patterns
- **`/v1/on-chain-events`** ($0.01) — Decoded on-chain events, recent transfers
- **`/v1/sanctions-screen`** ($0.02) — OFAC/EU sanctions entity check

**The x402 pattern:**
No API key registration. Your wallet address is your identity. When you call an endpoint, you get HTTP 402 with payment instructions, sign a USDC transfer on Base, and retry. The facilitator at payai.network verifies payment.

This means any DeFi protocol or bot can integrate these endpoints without managing API keys or subscriptions. Just needs a funded wallet.

**Try it:**
```bash
curl -i -X POST https://agentpay.help/v1/crypto-price \
  -H 'Content-Type: application/json' \
  -d '{"symbols":["BTC","ETH"]}'
```
→ Returns HTTP 402 with payment terms.

Full catalog: https://agentpay.help/.well-known/x402

---

## r/SideProject

**Title:** I built a marketplace where AI agents pay per API call with crypto — no accounts, no API keys

**Body:**

**TL;DR:** AgentPay — 22 AI microservices (summarize, translate, code review, image description, etc.) where payment happens at the HTTP layer. Your wallet is your login. $0.005–$0.10 per call.

**The problem I was solving:**
I was building AI agents that needed to call external services. Every service wanted: an account, an API key, a subscription, rate limit management. For an agent that might call a service 3 times, that's absurd overhead.

**The solution:**
What if payment *was* the authentication? The x402 protocol (HTTP 402 Payment Required) does exactly this. You call an API, get a 402 with payment instructions, pay in USDC on Base, and get your result.

**What I built:**
- 22 AI endpoints: text summarization, sentiment analysis, code review, translation, image description, token safety checks, DeFi data, wallet risk screening, and more
- Prices from $0.005 to $0.10 per call
- USDC on Base — low gas makes micropayments viable
- Machine-readable discovery (agent.json, x402 catalog, llms.txt) so AI agents can find and use services autonomously
- MCP server that wraps all endpoints for Claude Desktop / Cursor / etc.

**Tech stack:**
- Node.js backend
- x402 payment protocol (HTTP 402 + USDC transfers)
- Base L2 for settlement
- Apache-2.0 licensed

**Status:** Live at https://agentpay.help — working payments, 22 endpoints.

**What I'd love feedback on:**
- Is the "wallet as auth" pattern practical for production use?
- Would you use pay-per-call instead of subscriptions for AI services?
- What endpoints would you add?

Source: https://github.com/ronaldanton/x402-shop

---

## r/startups

**Title:** We're trying "wallet as auth" for API monetization — no accounts, no API keys, just USDC micropayments

**Body:**

We built **AgentPay** as an experiment in API monetization that eliminates the traditional account/key/subscription model.

**The thesis:**
For AI microservices priced at $0.005–$0.10 per call, the overhead of account management, API key distribution, and subscription billing doesn't make sense. What if we let the payment layer handle all of that?

**What we built:**
- 22 AI microservices (text analysis, code review, translation, image description, crypto/DeFi data, compliance checks)
- x402 protocol: HTTP 402 → pay in USDC on Base → get result
- No accounts, no API keys, no rate limits (payment naturally rate-limits)
- Machine-readable discovery so AI agents can find and use services autonomously

**Why this might work:**
1. **Zero onboarding friction** — developers don't sign up, they just call the API
2. **Perfect for AI agents** — agents can discover, pay for, and use services without human account setup
3. **True pay-per-use** — no minimum commitments, no wasted subscription budget
4. **Crypto-native** — $0.005 micropayments are viable on Base (impossible with credit cards)

**Early signals:**
- The MCP server integration has gotten interest from the Model Context Protocol community
- AI agent builders are the natural early adopters (agents need to call services programmatically)
- The "agent card" discovery format (agent.json) lets agents find services without human curation

**What we're figuring out:**
- Is "wallet as auth" enough for enterprise, or do we need traditional auth too?
- How to handle disputes/refunds with crypto payments
- Whether to add more vertical-specific endpoints or keep it horizontal

Live: https://agentpay.help
Source: https://github.com/ronaldanton/x402-shop (Apache-2.0)

Would love to hear from other founders who've experimented with crypto micropayments for SaaS.
