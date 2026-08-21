## Reddit Posts

### r/SideProject
**Title:** I built a pay-per-call AI service that accepts USDC — no accounts, no API keys

**Body:**
I've been experimenting with the x402 (Machine Payments Protocol) — it's an open standard that revives HTTP 402 "Payment Required" so AI agents can pay for API calls instantly.

I built AgentPay (https://agentpay.help) — 7 AI services behind an x402 paywall:

- Text summarization ($0.01)
- Insurance lead classifier ($0.02)
- Sentiment analysis ($0.02)
- Field extraction ($0.03)
- Translation ($0.03)
- AI code review ($0.05)
- Full analysis bundle ($0.10)

No accounts, no signup forms, no API keys — just send USDC and get your result. It's fully open source on GitHub.

This is a working reference implementation of the protocol. Would love feedback from devs who've tried x402 or similar pay-per-call models.

### r/Artificial
**Title:** Agent-to-agent payments are here — AI microservices behind HTTP 402

**Body:**
The Machine Payments Protocol (MPP) lets AI agents pay for services without human intervention. No credit cards, no OAuth flow — just HTTP 402 and USDC.

I built a production implementation: https://agentpay.help

7 services ranging from $0.01-$0.10 per call. Open source at https://github.com/ronaldanton/x402-shop

This is going to change how AI APIs work. Thoughts?
