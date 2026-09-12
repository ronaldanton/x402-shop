# AgentPay — Discord Messages (Copy-Paste Ready)

## Target Servers to Join and Post

### 1. Model Context Protocol (MCP) Discord
- **Server:** https://discord.gg/modelcontextprotocol
- **Channel:** #showcase or #projects
- **Message:**

```
Hey everyone! I built an MCP server that wraps 22 paid AI microservices behind the x402 protocol (HTTP 402 Payment Required).

**What it does:** Exposes endpoints like summarization, sentiment analysis, code review, translation, image description, and more — all callable from any MCP client. Payment happens automatically via USDC on Base.

**How to use:**
```
npx github:ronaldanton/x402-shop mcp-server.js
```
Set `SHOP_URL=https://agentpay.help` and `BUYER_PRIVATE_KEY=<hex>`.

**Endpoints include:** summarize ($0.01), sentiment ($0.02), code-review ($0.05), translate ($0.03), image-describe ($0.03), web-scrape ($0.01), and 16 more.

The interesting part is that x402 handles auth — no API keys needed. Your wallet is your identity. The MCP server just forwards requests and handles the 402 payment dance automatically.

Live: https://agentpay.help
Source: https://github.com/ronaldanton/x402-shop
Agent card: https://agentpay.help/.well-known/agent.json

Would love feedback on the x402-as-auth pattern for MCP servers!
```

### 2. x402 / PayAI Discord
- **Server:** Look for PayAI or x402 protocol Discord
- **Search:** "x402 discord" or "payai discord"
- **Channel:** #builders or #projects
- **Message:**

```
Built something with x402! AgentPay — 22 AI microservices (summarize, sentiment, code-review, translate, image-describe, token-safety, wallet-risk, defi-yields, etc.) all behind x402 on Base.

Prices: $0.005–$0.10 per call, USDC settlement.
No accounts, no API keys — wallet is auth.

Also built an MCP server that wraps all endpoints:
`npx github:ronaldanton/x402-shop mcp-server.js`

Machine-readable catalog: https://agentpay.help/.well-known/x402
Live: https://agentpay.help
Source: https://github.com/ronaldanton/x402-shop

The x402 facilitator at payai.network handles verification. Happy to share learnings from building on the protocol.
```

### 3. AI Agent Builders Discord (various)
- **Servers to search:** LangChain, CrewAI, AutoGPT, AgentOps, etc.
- **Channel:** #showcase or #projects
- **Message:**

```
Sharing a project for anyone building AI agents that need external services:

**AgentPay** — 22 AI microservices your agents can call without API keys or accounts. Payment via USDC on Base using the x402 protocol (HTTP 402).

**Why this matters for agents:**
- No account creation needed — agents can use services autonomously
- Pay-per-call ($0.005–$0.10) — no subscriptions to manage
- Agent-native discovery via agent.json and llms.txt
- MCP server available for MCP-based agents

**Services:** text summarization, sentiment analysis, code review, translation, image description, web scraping, token safety checks, DeFi data, wallet risk screening, and more.

Live: https://agentpay.help
GitHub: https://github.com/ronaldanton/x402-shop
```

### 4. Base / Coinbase Discord
- **Server:** https://discord.gg/buildonbase
- **Channel:** #builders or #showcase
- **Message:**

```
Built a pay-per-call AI microservices marketplace on Base! 🟦

**AgentPay** — 22 AI endpoints (summarize, translate, code-review, sentiment, image-describe, token-safety, wallet-risk, defi-yields, etc.) where you pay $0.005–$0.10 per call in USDC.

**The x402 flow:**
POST → HTTP 402 → sign USDC transfer on Base → get result

No accounts, no API keys. Wallet is auth. The low gas on Base makes $0.005 micropayments viable.

Also built an MCP server for AI agent integration.

Live: https://agentpay.help
Source: https://github.com/ronaldanton/x402-shop
```

## Posting Strategy
- Don't spam the same message across channels — tailor to each community
- Post in #showcase or #projects channels, not general chat
- Engage with replies — don't just drop and leave
- Wait a few days between posting to different servers
- Be active in the community first if possible
