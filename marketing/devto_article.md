# AgentPay: Pay-Per-Call AI Microservices via x402 (HTTP 402)

---

**Title:** Building a Pay-Per-Call AI Marketplace with the x402 Protocol (No API Keys Needed)

**Tags:** `ai`, `api`, `cryptocurrency`, `webdev`, `agents`

**Canonical URL:** https://agentpay.help

---

## Introduction

What if API authentication *was* the payment?

I've been building AI agents that need to call external services — summarization, sentiment analysis, code review, translation. Every service wants: an account, an API key, a subscription, rate limit management.

For an agent that might call a service 3 times, that's absurd overhead.

So I built **AgentPay** — a marketplace of 22 AI microservices where the [x402 protocol](https://x402.org) (HTTP 402 Payment Required) handles both authentication and payment in a single step.

No accounts. No API keys. No subscriptions. Your wallet is your identity.

## The x402 Protocol

x402 is based on a simple idea: HTTP has a status code for "payment required" (402), but it's never been properly used. The x402 protocol defines a standard way for servers to say "pay me this much in this currency on this network" and for clients to comply.

Here's the flow:

```
Client                          Server
  |                               |
  |--- POST /v1/summarize ------>|
  |                               |
  |<-- HTTP 402 -----------------|
  |    {amount, currency,         |
  |     network, recipient}       |
  |                               |
  |--- [signs USDC transfer] --->|
  |--- POST /v1/summarize ------>|
  |    {payment_proof}            |
  |                               |
  |<-- HTTP 200 -----------------|
  |    {result}                   |
```

The payment is a real USDC transfer on Base (EIP-155:8453). A facilitator service verifies the payment server-side.

## What AgentPay Offers

22 endpoints, priced from $0.005 to $0.10 per call:

### Text Processing
| Endpoint | Price | Description |
|----------|-------|-------------|
| `/v1/summarize` | $0.01 | 250-word summary of any text (up to 20k chars) |
| `/v1/sentiment` | $0.02 | Positive/negative/neutral with emotions and keywords |
| `/v1/translate` | $0.03 | Translate to any language |
| `/v1/extract` | $0.03 | Structured field extraction from documents |
| `/v1/content-safety` | $0.02 | PII, toxicity, and bias detection |

### Code & Vision
| Endpoint | Price | Description |
|----------|-------|-------------|
| `/v1/code-review` | $0.05 | Bugs, security, performance, quality score |
| `/v1/image-describe` | $0.03 | Vision AI description of any image URL |

### Crypto & DeFi
| Endpoint | Price | Description |
|----------|-------|-------------|
| `/v1/token-safety` | $0.02 | Rug pull risk, honeypot detection |
| `/v1/wallet-risk` | $0.02 | OFAC screening, scam flags |
| `/v1/crypto-price` | $0.005 | Real-time crypto prices |
| `/v1/defi-yields` | $0.01 | APY, TVL, protocol data |
| `/v1/on-chain-events` | $0.01 | Decoded on-chain events |

### Compliance & Data
| Endpoint | Price | Description |
|----------|-------|-------------|
| `/v1/sanctions-screen` | $0.02 | OFAC/EU sanctions check |
| `/v1/threat-intel` | $0.02 | CVE/vulnerability lookup |
| `/v1/web-scrape` | $0.01 | Clean text from any URL |
| `/v1/news-feed` | $0.005 | Real-time news by topic |
| `/v1/weather-data` | $0.005 | Current conditions + forecast |
| `/v1/market-intel` | $0.02 | GDP, inflation, rates |
| `/v1/legal-lookup` | $0.03 | Company registration lookup |

### Insurance
| Endpoint | Price | Description |
|----------|-------|-------------|
| `/v1/classify-insurance` | $0.02 | Insurance lead classifier |
| `/v1/insurance-analysis` | $0.10 | Full analysis bundle |

### Meta
| Endpoint | Price | Description |
|----------|-------|-------------|
| `/v1/agent-reputation` | $0.01 | Endpoint trustworthiness score |

## Try It

```bash
# This will return HTTP 402 with payment instructions
curl -i -X POST https://agentpay.help/v1/summarize \
  -H 'Content-Type: application/json' \
  -d '{"text":"The x402 protocol enables HTTP-native micropayments..."}'
```

To actually complete a payment, you need an x402 client. The easiest way is through the MCP server:

```bash
# Install and run the MCP server
npx github:ronaldanton/x402-shop mcp-server.js

# Set environment variables:
# SHOP_URL=https://agentpay.help
# BUYER_PRIVATE_KEY=<your hex private key>
```

## MCP Integration

The MCP (Model Context Protocol) server wraps all 22 endpoints into tools that any MCP-compatible client can use. When a tool is called, the server:

1. Makes the POST request to AgentPay
2. Receives the HTTP 402 payment instructions
3. Signs a USDC transfer using the configured private key
4. Retries with the payment proof
5. Returns the result to the MCP client

The agent never knows it paid. It just calls a tool and gets a result.

### Configuration

```json
{
  "mcpServers": {
    "agentpay": {
      "command": "node",
      "args": ["mcp-server.js"],
      "env": {
        "SHOP_URL": "https://agentpay.help",
        "BUYER_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

## Machine-Readable Discovery

One of the goals is making services discoverable by AI agents without human curation:

- **[agent.json](https://agentpay.help/.well-known/agent.json)** — Agent card with capabilities, prices, and endpoints
- **[x402 catalog](https://agentpay.help/.well-known/x402)** — Machine-readable endpoint catalog
- **[llms.txt](https://agentpay.help/llms.txt)** — LLM-friendly service descriptions
- **[openapi.json](https://agentpay.help/openapi.json)** — Standard OpenAPI 3.0 spec

An agent hitting `/.well-known/agent.json` can learn everything it needs to discover and call services.

## Why USDC on Base?

Three reasons:

1. **Low gas** — Base L2 transactions cost ~$0.001, making $0.005 micropayments viable. On Ethereum mainnet, gas alone would be $2–5.

2. **Stable value** — USDC means $0.01 is always $0.01. No ETH price volatility in your API costs.

3. **Fast settlement** — Near-instant confirmation. No waiting for block finality.

The x402 facilitator at [payai.network](https://facilitator.payai.network) handles payment verification, so the server doesn't need to run its own node.

## The "Wallet as Auth" Pattern

This is the key insight: **your wallet address IS your identity.**

Traditional auth requires:
- Account creation
- Email verification
- Password management
- API key generation
- Key rotation
- Billing setup

x402 auth requires:
- A funded wallet

That's it. The payment proves you are who you say you are, because only the wallet owner can sign transactions from that address.

This is especially powerful for AI agents, which can't fill out signup forms or verify email addresses, but *can* sign transactions with a private key.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  AI Agent /  │     │   AgentPay   │     │  x402 Facilitator│
│  MCP Client  │────▶│   Server     │────▶│  (payai.network) │
│             │     │              │     │                  │
│  Has wallet  │     │  22 endpoints│     │  Verifies USDC   │
│  USDC on Base│     │  Returns 402 │     │  payments on Base│
└─────────────┘     └──────────────┘     └─────────────────┘
```

## Source Code

The entire system is open source (Apache-2.0):

```
https://github.com/ronaldanton/x402-shop
```

## What's Next

- More endpoints based on demand
- Support for additional L2s (Optimism, Arbitrum)
- Streaming responses for longer operations
- Webhook callbacks for async tasks
- Better error messages on insufficient funds

## Try It Live

- **Live API:** https://agentpay.help
- **GitHub:** https://github.com/ronaldanton/x402-shop
- **llms.txt:** https://agentpay.help/llms.txt

---

*If you're building AI agents and tired of API key management, I'd love to hear your thoughts. Is "wallet as auth" practical for production use?*

*Discuss on [Hacker News]() | [GitHub Issues](https://github.com/ronaldanton/x402-shop/issues)*
