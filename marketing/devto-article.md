# I Built an AI Service That Accepts Crypto Payments — Here's How

*How I used the x402 protocol to create pay-per-call AI services that accept USDC on Base Mainnet.*

---

## The Problem: AI Agents Can't Pay for APIs

I've been building AI agents for a while now. They're great at research, coding, and automation. But there's one fundamental problem:

**When an AI agent needs to call an API, it has to:**
1. Create an account
2. Enter a credit card
3. Pass CAPTCHA
4. Wait for verification
5. Get an API key

This is a human workflow. AI agents can't do this. They're stuck.

## The Solution: HTTP 402 + x402 Protocol

The x402 protocol (backed by Coinbase and Stripe) fixes this. It uses the HTTP 402 "Payment Required" status code to enable instant micropayments.

**How it works:**
1. Agent sends a request to an endpoint
2. Server returns `402 Payment Required` with payment requirements
3. Agent signs a USDC micropayment (EIP-3009, gasless!)
4. Agent retries with payment attached
5. Server verifies payment and returns the response

No accounts. No API keys. Just crypto.

## What I Built: x402-shop

I built **x402-shop** — three AI services behind an HTTP 402 paywall:

| Service | Price | What It Does |
|---------|-------|--------------|
| Summarize | $0.01 | 250-word summary of any text |
| Insurance Classifier | $0.02 | Intent, urgency, line of business |
| Field Extractor | $0.03 | Structured key-value extraction |
| **Full Analysis** | **$0.10** | All three combined |

The whole thing runs on:
- **x402 V2 SDK** (`@x402/express` 2.22.0)
- **Base Mainnet** — fast, cheap L2
- **USDC** — stablecoin, $1 = $1, always
- **Ollama** — local AI inference (gemma4:31b-cloud)
- **Express 5** — Node.js server
- **Cloudflare Tunnel** — public access

## The Tech Stack

Here's what I used:

```javascript
// The key middleware
const { PaymentMiddleware } = require("@x402/express");

const pay = PaymentMiddleware({
  address: "0xYourWalletAddress",
  network: "base",
  facilitatorUrl: "https://facilitator.payai.network",
});

// Apply to routes
app.post("/v1/summarize", pay, async (req, res) => {
  // Your AI logic here
  const summary = await summarize(req.body.text);
  res.json({ summary });
});
```

The middleware handles everything:
- Returns 402 with payment requirements
- Verifies incoming payments
- Rejects invalid payments

## How the 402 Handshake Works

**Step 1: Agent sends request**
```bash
curl -X POST https://your-server.com/v1/summarize \
  -H "Content-Type: application/json" \
  -d '{"text": "Your text here..."}'
```

**Step 2: Server returns 402**
```json
{
  "status": 402,
  "message": "Payment Required",
  "paymentRequired": {
    "amount": "10000",
    "currency": "USDC",
    "network": "base",
    "recipient": "0xYourWalletAddress"
  }
}
```

**Step 3: Agent pays and retries**
```bash
curl -X POST https://your-server.com/v1/summarize \
  -H "Content-Type: application/json" \
  -H "X-PAYMENT: <signed-payment>" \
  -d '{"text": "Your text here..."}'
```

**Step 4: Server verifies and returns 200**
```json
{
  "summary": "This is a concise summary of the text..."
}
```

## Revenue Model: Micro-payments at Scale

The beauty of x402 is the pricing:
- $0.01 per summary
- $0.02 per classification
- $0.03 per extraction

These are micro-payments. But at scale:
- 100 calls/day = $1-3/day = $30-90/month
- 1,000 calls/day = $10-30/day = $300-900/month
- 10,000 calls/day = $100-300/day = $3,000-9,000/month

The target: AI agents that need to process documents, emails, or data.

## Open Source: Fork It and Build Your Own

The entire project is open source on GitHub:

**Repository:** [github.com/ronaldanton/x402-shop](https://github.com/ronaldanton/x402-shop)

**Quick Start:**
```bash
git clone https://github.com/ronaldanton/x402-shop.git
cd x402-shop
npm install
# Pull Ollama model
ollama pull gemma4:31b-cloud
# Configure .env
cp .env.example .env
# Start server
npm start
```

## What's Next: The Agent Economy

We're at the beginning of something big:
- AI agents are becoming autonomous
- They need to pay for services
- x402 makes this possible
- The machine-to-machine economy is here

I'm building more services:
- Vision/image analysis
- Code review
- Document parsing
- Custom fine-tuned models

**The question isn't whether agents will pay for services — it's how much they'll pay.**

---

*Built with love for the machine-to-machine economy. 💰*

**Try it now:** [x402-shop](https://yard-singer-minus-drain.trycloudflare.com)

**Follow me on Twitter:** @YourHandle

**Star the repo:** [github.com/ronaldanton/x402-shop](https://github.com/ronaldanton/x402-shop)
