# AgentPay

> **Machine-payable AI microservices via the [402 Payment Required](https://x402.org) protocol (x402 / MPP)**

No accounts. No API keys. No OAuth. Pay per call in USDC on Base.

AgentPay is an open-source reference implementation of the [Machine Payments Protocol](https://x402.org) — wrapping local AI models behind an HTTP 402 paywall so that AI agents (and humans) can pay for compute on a per-request basis using stablecoins.

Built with Express 5, `@x402/express`, and Ollama-served Gemma models. Live on Base mainnet with the PayAI facilitator.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Services & Pricing](#services--pricing)
- [Tech Stack](#tech-stack)
- [Deployment](#deployment)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Contributing](#contributing)
- [License](#license)

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 20
- **Ollama** running locally with the required model pulled
- A **wallet private key** (for receiving payments)

### 1. Clone & install

```bash
git clone https://github.com/your-org/AgentPay.git
cd AgentPay
npm install
```

### 2. Pull the AI model

```bash
ollama pull gemma3:1b
# Or use a larger model for better quality:
# ollama pull gemma4:31b-cloud
```

### 3. Configure

```bash
cp .env.example .env
# Edit .env — set SELLER_ADDRESS to your wallet address
```

### 4. Start the server

```bash
npm start
# AgentPay listening on :4021
#   payTo:   0xYourWalletAddress
#   network: eip155:84532 (Base Sepolia testnet)
#   facilitator: https://x402.org/facilitator
```

### 5. Test a paid request

```bash
# Unpaid request → HTTP 402 (paywall)
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:4021/v1/summarize \
  -H 'Content-Type: application/json' \
  -d '{"text":"Machine Payments Protocol lets AI agents pay for API calls using the HTTP 402 status code."}'
# → 402

# Automated test (requires buyer wallet with USDC)
npm run test:402
```

### 6. Buy a service (buyer client)

```bash
# Set your buyer private key in .env
echo "BUYER_PK=0xYourPrivateKey" >> .env

# Run the buyer script
npm run buyer -- /v1/summarize ./payload.json
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AgentPay Architecture                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐    HTTP POST     ┌───────────────────────────┐    │
│  │  Client   │ ──────────────► │      Express 5 Server     │    │
│  │ (Agent /  │   (no auth)     │        (port 4021)        │    │
│  │  Human)   │                 │                           │    │
│  └──────────┘                 │  ┌─────────────────────┐  │    │
│       │                       │  │   Payment Middleware  │  │    │
│       │                       │  │   (@x402/express)    │  │    │
│       │                       │  │                      │  │    │
│       │  ◄── HTTP 402 ───────│  │  • Validates x402    │  │    │
│       │      (paywall)        │  │    payment headers   │  │    │
│       │                       │  │  • Verifies on-chain │  │    │
│       │  ──── signed payment ►│  │    via facilitator   │  │    │
│       │      (USDC)           │  │                      │  │    │
│       │                       │  └──────────┬──────────┘  │    │
│       │  ◄── 200 OK ─────────│             │              │    │
│       │      (result JSON)    │  ┌──────────▼──────────┐  │    │
│       │                       │  │   Service Handlers   │  │    │
│       │                       │  │                      │  │    │
│       │                       │  │  /v1/summarize       │  │    │
│       │                       │  │  /v1/classify-ins    │  │    │
│       │                       │  │  /v1/extract         │  │    │
│       │                       │  └──────────┬──────────┘  │    │
│       │                       └─────────────┼─────────────┘    │
│       │                                     │                   │
│       │                              ┌──────▼──────┐           │
│       │                              │   Ollama     │           │
│       │                              │  (local LLM) │           │
│       │                              │  gemma3:1b   │           │
│       │                              └─────────────┘           │
│       │                                                         │
│  ┌────▼────────────────────────────────────────────────────┐    │
│  │                  Payment Flow (x402)                    │    │
│  │                                                         │    │
│  │  Client ──► HTTP 402 ──► Facilitator ──► On-Chain ──►   │    │
│  │                │         (PayAI)       Base Mainnet     │    │
│  │                ▼                         (USDC)         │    │
│  │          Payment Required                                │    │
│  │          (price + accepts[])                             │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Free Endpoints (no paywall)                            │    │
│  │  • /              — Landing page (HTML)                 │    │
│  │  • /health        — Health check                        │    │
│  │  • /stats         — Revenue & usage stats               │    │
│  │  • /.well-known/x402 — Machine-readable service catalog │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Data Layer                                             │    │
│  │  • data/ledger.json — Append-only payment ledger        │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**How it works:**

1. Client sends `POST /v1/summarize` (or any paid endpoint) — no auth headers needed
2. Payment middleware intercepts, returns **HTTP 402** with pricing info (`accepts[]`)
3. Client constructs a USDC payment, signs it, attaches `X-PAYMENT` header
4. Facilitator verifies the payment on Base mainnet
5. Middleware grants access → request proceeds to the service handler
6. Handler calls Ollama, returns AI-generated result as JSON

---

## Services & Pricing

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /v1/summarize` | **$0.01** | Summarize text (200–20,000 chars). Returns a ~250-word summary. |
| `POST /v1/classify-insurance` | **$0.02** | Classify insurance leads: intent, urgency, line-of-business, confidence score. |
| `POST /v1/sentiment` | **$0.02** | Sentiment analysis: positive/negative/neutral with emotions and keywords. |
| `POST /v1/extract` | **$0.03** | Extract structured key-value fields from raw text (emails, forms, documents). |
| `POST /v1/translate` | **$0.03** | Text translation to any language. |
| `POST /v1/code-review` | **$0.05** | AI code review: bugs, security issues, performance, quality analysis. |
| `POST /v1/insurance-analysis` | **$0.10** | ⭐ FULL BUNDLE — classification + extraction + summary in one call. |

All services accept USDC on **Base mainnet** (chain ID `8453`) via the `exact` payment scheme. Testnet (Base Sepolia) is available via configuration.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| **Runtime** | Node.js ≥ 20 (ESM) |
| **HTTP Server** | Express 5.2 |
| **Payment Protocol** | `@x402/express` 2.22, `@x402/evm`, `@x402/fetch`, `@x402/extensions` |
| **Blockchain** | Base (OP Stack L2), USDC stablecoin |
| **Facilitator** | PayAI x402 facilitator (`x402.org/facilitator`) |
| **AI Runtime** | Ollama (local inference) |
| **LLM** | Gemma 3 1B (default) / Gemma 4 31B (recommended) |
| **Wallet** | `viem` (Ethereum client library) |
| **Config** | dotenv |

---

## Deployment

### Local Development

```bash
# Base Sepolia testnet (recommended for development)
cp .env.example .env
# Edit .env: PAYMENT_NETWORK=eip155:84532
npm start
```

### Production (Base Mainnet)

```bash
# Edit .env for mainnet
PAYMENT_NETWORK=eip155:8453       # Base mainnet
SELLER_ADDRESS=0xYourMainnetWallet
OLLAMA_URL=http://127.0.0.1:11434
MODEL_SUMMARIZE=gemma4:31b-cloud  # Use larger model for quality
MODEL_CLASSIFY=gemma4:31b-cloud
MODEL_EXTRACT=gemma4:31b-cloud
```

### Docker (recommended for production)

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src/ ./src/
COPY data/ ./data/
EXPOSE 4021
HEALTHCHECK CMD curl -f http://localhost:4021/health || exit 1
CMD ["node", "src/server.js"]
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `4021` | Server port |
| `SELLER_ADDRESS` | **Yes** | — | Wallet address to receive USDC payments |
| `PAYMENT_NETWORK` | No | `eip155:84532` | Blockchain network (`eip155:8453` for mainnet) |
| `FACILITATOR_URL` | No | `https://x402.org/facilitator` | x402 facilitator endpoint |
| `OLLAMA_URL` | No | `http://127.0.0.1:11434` | Ollama API base URL |
| `MODEL_SUMMARIZE` | No | `gemma3:1b` | Model for summarize endpoint |
| `MODEL_CLASSIFY` | No | `gemma3:1b` | Model for classify-insurance endpoint |
| `MODEL_EXTRACT` | No | `gemma3:1b` | Model for extract endpoint |
| `PUBLIC_URL` | No | — | Public URL for discovery metadata |

---

## API Reference

### Free Endpoints

#### `GET /`

Landing page with service catalog and usage stats.

#### `GET /health`

Health check.

```json
{ "ok": true, "ts": "2025-01-01T00:00:00.000Z" }
```

#### `GET /stats`

Revenue and usage statistics.

```json
{
  "requests_paid": 42,
  "gross_usd": 0.84,
  "by_service": { "summarize": 0.42, "classify-insurance": 0.28, "extract": 0.14 },
  "last_20": [...]
}
```

#### `GET /.well-known/x402`

Machine-readable service catalog (Bazaar discovery extension). Use this for automated service discovery by AI agents.

```json
{
  "name": "AgentPay",
  "description": "Pay-per-call AI microservices (x402 / MPP)",
  "endpoints": [
    { "path": "/v1/summarize", "method": "POST", "price": "$0.01", "description": "Summarize text (200-20k chars)" },
    { "path": "/v1/classify-insurance", "method": "POST", "price": "$0.02", "description": "Insurance lead classification" },
    { "path": "/v1/extract", "method": "POST", "price": "$0.03", "description": "Structured field extraction" }
  ]
}
```

---

### Paid Endpoints

All paid endpoints require a valid x402 payment in the `X-PAYMENT` header. Unpaid requests receive **HTTP 402 Payment Required**.

#### `POST /v1/summarize` — **$0.01**

Summarize text into a concise ~250-word output.

**Request:**

```json
{
  "text": "Your text to summarize (200-20000 characters)..."
}
```

**Response (200 OK):**

```json
{
  "summary": "The text discusses...",
  "words": 247
}
```

**Errors:**
- `400` — Missing `text` field or text exceeds 20,000 characters
- `402` — Payment required (see x402 protocol)
- `502` — Upstream AI model failed

---

#### `POST /v1/classify-insurance` — **$0.02**

Classify an insurance lead or customer message.

**Request:**

```json
{
  "text": "I was in a car accident last week and need to file a claim urgently..."
}
```

**Response (200 OK):**

```json
{
  "intent": "claim",
  "urgency": "high",
  "line": "auto",
  "confidence": 0.92
}
```

**Possible values:**
- `intent`: `quote_request` | `renewal` | `claim` | `complaint` | `other`
- `urgency`: `low` | `medium` | `high`
- `line`: `auto` | `home` | `life` | `health` | `commercial` | `other`

---

#### `POST /v1/extract` — **$0.03**

Extract structured fields from raw text (emails, forms, documents).

**Request:**

```json
{
  "text": "From: john@example.com\nSubject: Policy #12345 renewal\nDear customer, your auto policy expires on March 15...",
  "fields": ["email", "policy_number", "expiry_date"]
}
```

**Response (200 OK):**

```json
{
  "email": "john@example.com",
  "policy_number": "12345",
  "expiry_date": "March 15"
}
```

If `fields` is omitted, all extractable key-value pairs are returned.

---

### Client Library (Buyer)

Use `@x402/fetch` to automatically handle the 402 → payment → retry flow:

```javascript
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(process.env.BUYER_PK);
const client = x402Client.fromConfig({
  schemes: [{ network: "eip155:*", client: new ExactEvmScheme(signer) }],
});

const payFetch = wrapFetchWithPayment(globalThis.fetch, client);

// This automatically handles the 402 → payment → retry flow
const res = await payFetch("http://localhost:4021/v1/summarize", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text: "Your text here..." }),
});

const result = await res.json();
console.log(result.summary);
```

---

## Contributing

Contributions are welcome! This is an open-source reference implementation of the x402 / MPP protocol.

### Development Setup

```bash
git clone https://github.com/your-org/AgentPay.git
cd AgentPay
npm install
cp .env.example .env
# Edit .env with your test wallet and Base Sepolia settings
npm start
```

### Adding a New Service

1. Define the payment middleware entry in `src/server.js` under the `paymentMiddleware()` call
2. Add the route handler after the middleware block
3. Register the endpoint in `/.well-known/x402` discovery
4. Add to the landing page HTML

### Guidelines

- **Keep it simple.** This is a reference implementation — clarity over complexity.
- **Test on Base Sepolia first.** Use the testnet before going to mainnet.
- **Use `@x402/` packages.** Don't reinvent payment verification.
- **Append-only ledger.** Never modify `data/ledger.json` — only append.

### Reporting Issues

Open a GitHub issue with:
- Steps to reproduce
- Expected vs. actual behavior
- Environment (Node version, OS, model used)

---

## License

MIT

---

## Resources

- [x402 Protocol Spec](https://x402.org) — The Machine Payments Protocol
- [PayAI Facilitator](https://x402.org/facilitator) — Payment verification service
- [Base Network](https://base.org) — OP Stack L2 where USDC payments settle
- [Ollama](https://ollama.com) — Local LLM inference engine
- [viem](https://viem.sh) — TypeScript Ethereum client
