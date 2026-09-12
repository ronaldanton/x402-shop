# AgentPay — Twitter/X Threads (Copy-Paste Ready)

---

## Thread 1: Launch Announcement

**Tweet 1:**
I built a marketplace where AI agents pay per API call with crypto.

No accounts. No API keys. No subscriptions.

Your wallet IS your login.

22 AI microservices, $0.005–$0.10 per call, USDC on Base.

Here's how it works 🧵

**Tweet 2:**
The problem: every AI service wants you to create an account, manage API keys, and pay $20/month.

But what if your agent only needs sentiment analysis 3 times? Or a code review once?

Subscriptions don't work for agents. Micropayments do.

**Tweet 3:**
The x402 protocol (HTTP 402 Payment Required) solves this at the HTTP layer:

1. Agent POSTs to /v1/summarize
2. Gets HTTP 402 + payment instructions
3. Signs a USDC transfer on Base
4. Retries with proof → gets the result

Payment IS the authentication.

**Tweet 4:**
What's available:

📝 Summarize text — $0.01
💬 Sentiment analysis — $0.02
🔍 Code review — $0.05
🌍 Translation — $0.03
👁️ Image description — $0.03
🛡️ Token safety check — $0.02
📊 DeFi yields — $0.01
💰 Crypto prices — $0.005

22 endpoints total.

**Tweet 5:**
The cool part: agents can discover services autonomously.

Every endpoint is described in:
• agent.json — agent-native discovery
• x402 catalog — machine-readable endpoint list
• llms.txt — LLM-friendly descriptions
• OpenAPI — standard spec

No human curation needed.

**Tweet 6:**
There's also an MCP server for Claude Desktop / Cursor:

```
npx github:ronaldanton/x402-shop mcp-server.js
```

It wraps all 22 endpoints and handles the x402 payment dance automatically.

**Tweet 7:**
Why USDC on Base?

• Low gas → $0.005 payments are viable
• Stable → no ETH price volatility in your API costs
• Fast → near-instant settlement
• On-chain → verifiable payment history

$0.005 micropayments are impossible with credit cards. Crypto was built for this.

**Tweet 8:**
Live: https://agentpay.help
Source: https://github.com/ronaldanton/x402-shop (Apache-2.0)

If you're building AI agents and tired of API key management — try it.

Feedback welcome. Is "wallet as auth" practical for production?

---

## Thread 2: Technical Deep Dive

**Tweet 1:**
Deep dive on the x402 payment protocol and how I used it to build an AI microservices marketplace.

If you're building agents that need to pay for services autonomously, this is for you 🧵

**Tweet 2:**
Traditional API auth flow:
1. Create account
2. Verify email
3. Generate API key
4. Set up billing
5. Add credit card
6. Manage rate limits

x402 flow:
1. Call endpoint
2. Pay
3. Get result

That's it. The wallet IS the account.

**Tweet 3:**
The HTTP 402 response includes:
• Payment amount (in USDC)
• Recipient address
• Network (Base, eip155:8453)
• Payment details for the x402 facilitator

Your client signs a transfer, and the facilitator at payai.network verifies it server-side.

**Tweet 4:**
Why this works for AI agents specifically:

Agents can't fill out signup forms.
Agents can't verify email addresses.
Agents can't manage API key rotation.

But agents CAN sign transactions with a private key.

Payment-native auth is agent-native auth.

**Tweet 5:**
The economics work on Base L2:

• Gas for a USDC transfer: ~$0.001
• API call price: $0.005–$0.10
• Payment overhead: 0.2%–20%

On Ethereum mainnet, gas alone would be $2–5. On Base, micropayments are viable.

**Tweet 6:**
Machine-readable discovery is key for agent autonomy.

Any agent can hit `/.well-known/agent.json` and learn:
• What services exist
• What they cost
• What parameters they accept
• How to authenticate (x402)

No human docs needed.

---

## Thread 3: Use Case Focused

**Tweet 1:**
"What if AI agents could just... pay for what they need?"

No accounts. No API keys. No subscriptions.

I built AgentPay to answer that question. Here are 5 things agents can do with it right now 🧵

**Tweet 2:**
1️⃣ Research agent scraping + summarizing

Agent needs to understand a topic:
• Call /v1/web-scrape ($0.01) to get page text
• Call /v1/summarize ($0.01) to distill it
• Total cost: $0.02 per source

No API key needed. Agent just pays.

**Tweet 3:**
2️⃣ DeFi risk assessment

Before interacting with a token:
• /v1/token-safety ($0.02) — rug pull check
• /v1/wallet-risk ($0.02) — deployer wallet screening
• /v1/defi-yields ($0.01) — current APY data
• Total: $0.05 for due diligence

**Tweet 4:**
3️⃣ Multilingual content agent

Agent processing user messages:
• /v1/sentiment ($0.02) — detect tone
• /v1/translate ($0.03) — translate response
• /v1/content-safety ($0.02) — check for PII/toxicity
• Total: $0.07 per message

**Tweet 5:**
4️⃣ Code review bot

On every PR:
• /v1/code-review ($0.05) — bugs, security, performance
• /v1/content-safety ($0.02) — check for leaked secrets
• Total: $0.07 per PR

No GitHub App installation. Just webhook → pay → comment.

**Tweet 6:**
5️⃣ Compliance screening

Before onboarding a client:
• /v1/sanctions-screen ($0.02) — OFAC/EU check
• /v1/legal-lookup ($0.03) — company registration
• /v1/wallet-risk ($0.02) — entity risk
• Total: $0.07 per entity

All USDC on Base. No accounts. Just pay and go.

---

## Single Tweets (standalone)

**Tweet A:**
Hot take: API keys are a relic of the subscription era.

For AI agents calling external services, payment-native auth (x402 / HTTP 402) makes more sense.

Your wallet is your identity. Each call costs what it costs. No accounts, no keys, no subscriptions.

22 AI microservices: https://agentpay.help

**Tweet B:**
The problem with $20/month AI API subscriptions:

Day 1: Use it for 3 calls
Day 2-30: Forget it exists
Day 31: "Why am I paying for this?"

AgentPay: pay $0.01–$0.10 per call, only when you need it.

**Tweet C:**
AI agents can't create accounts.
AI agents can't verify email.
AI agents can't manage API keys.

But AI agents CAN sign crypto transactions.

That's why x402 (HTTP 402 Payment Required) is the native auth protocol for agents.

**Tweet D:**
I just built an MCP server that handles paid API calls.

You call a tool → MCP server gets HTTP 402 → pays in USDC → retries → returns result.

The agent never knows it paid. Seamless.

```
npx github:ronaldanton/x402-shop mcp-server.js
```
