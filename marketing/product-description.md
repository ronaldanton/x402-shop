# AgentPay — AI Microservices via x402

**Live at: https://agentpay.help**

## Description
7 AI services behind the HTTP 402 Payment Required protocol. No accounts, no API keys — just pay with USDC on Base.

## Services
- **Summarize** — $0.01 | 250-word summary of any text
- **Insurance Classifier** — $0.02 | Classify leads by intent/urgency/line
- **Sentiment Analysis** — $0.02 | Positive/negative/neutral + emotions
- **Field Extractor** — $0.03 | Structured key-value extraction
- **Translate** — $0.03 | Text translation to any language
- **Code Review** — $0.05 | AI code review (bugs/security/performance)
- **Full Analysis Bundle** — $0.10 | Classification + extraction + summary

## Tech Stack
- Express 5 + @x402/express v2.22
- Gemma AI models via Ollama
- USDC on Base mainnet
- PayAI facilitator
- Open source: https://github.com/ronaldanton/x402-shop

## What is x402?
The Machine Payments Protocol (MPP) revives HTTP 402 "Payment Required" — allowing AI agents to instantly pay for API calls without human logins or credit cards. AgentPay is a production reference implementation.

## Contact
- GitHub: https://github.com/ronaldanton/x402-shop
- Web: https://agentpay.help
