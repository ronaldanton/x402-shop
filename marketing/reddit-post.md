# Reddit Post for r/x402

**Title:** Built AgentPay — AI services behind HTTP 402 paywall (summarize, classify, extract)

---

Hey r/x402 community! 👋

I just built **AgentPay** — a live reference implementation of the x402 protocol for selling AI services.

## What it does

Three AI services behind an HTTP 402 paywall:

| Service | Price | Description |
|---------|-------|-------------|
| Summarize | $0.01 | 250-word summary of any text |
| Insurance Classifier | $0.02 | Intent, urgency, line of business |
| Field Extractor | $0.03 | Structured key-value extraction |
| **Full Analysis** | **$0.10** | All three combined |

## How it works

1. Agent sends POST request to endpoint
2. Server returns `402 Payment Required` with payment requirements
3. Agent signs a USDC micropayment (EIP-3009, gasless!)
4. Agent retries with payment attached
5. Server verifies and returns 200 with AI response

## Tech stack

- **x402 V2 SDK** (`@x402/express` 2.22.0)
- **Base Mainnet** — fast, cheap L2
- **USDC** — stablecoin payments
- **Ollama** — local AI inference (gemma4:31b-cloud)
- **Express 5** — Node.js server
- **Cloudflare Tunnel** — public access

## Live now

🔗 https://yard-singer-minus-drain.trycloudflare.com

## Open source

GitHub: https://github.com/ronaldanton/AgentPay

Clone it, fork it, build your own. The README has a full quick start guide.

## What I learned

The x402 protocol is real and working. The hardest part isn't the payments — it's getting agents to discover your service. The Bazaar directory is the key, but registration triggers after the first payment through the facilitator.

Would love feedback from the community! What services would you pay for via x402?

---

*Built with love for the machine-to-machine economy. 💰*
