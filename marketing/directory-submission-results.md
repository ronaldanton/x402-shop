# AgentPay Directory & Marketplace Submissions

**Last updated:** 2026-09-12T23:15 UTC
**Repo:** https://github.com/ronaldanton/x402-shop
**Live URL:** https://agentpay.help
**Remote MCP:** https://agentpay.help/mcp (Streamable HTTP, 22 tools, no auth)

## ✅ Submitted / Published

| Directory | Status | Details |
|-----------|--------|---------|
| **x402scan** (Merit Systems) | ✅ Registered | **22 of 22 resources registered.** Merchant page: tryponcho.com/m/agentpay.help. Biggest x402 index. |
| **nohumans.directory** | ✅ 4 listings | Free programmatic submit via `POST api.nohumans.directory/v1/listings`. IDs `c83393fb-cb7` (summarize), `d6d87161-4ef` (insurance-analysis), `66bd156b-f8d` (token-safety), `ffbcbd30-c06` (extract). Probed every ~5 min; `verified` after a clean pass streak. Claim tokens saved in `marketing/nohumans-submissions.json`. |
| **awesome-x402** (xpaysh) | ✅ PR Updated | PR #1353 — AgentPay entry updated 7 → **22 services** + remote MCP. **This list feeds agent-tools.cloud's 2,300-service crawler.** |
| **x402 Discovery Index** | ✅ Submitted | GitHub issue #47 → https://github.com/x402-index/x402-discovery-index/issues/47 |
| **x402-wiki** (Service Encyclopedia) | ✅ Submitted | GitHub issue #29 → https://github.com/lordbasilaiassistant-sudo/x402-wiki/issues/29. Free 402 health check + public queue. (Their paid first-party review needs the wallet funded — noted in the issue.) |
| **mcp.directory** | ✅ Submitted | "Server Submitted!" — review within 24h |
| **payapi.market** | ✅ Submitted | Provider ID `af39694e-ee43-4b33-9025-de2c4876d2de` — pending review. Listed 22 endpoints / 22 tools, $0.005–$0.10. |
| **minia2a.uk** | ✅ Submitted | ID `x402-publish-1789252135272-agentpay` — pending approval. Wallet-signed publish. |
| **MCP Registry** | ✅ Published | `io.github.ronaldanton/agentpay` v1.0.0 — remote transport `https://agentpay.help/mcp` |
| **x402-list.com** | ✅ Submitted | ID `a6a0990c-c653-4faf-80ba-3e40ced2c56b`. 8/15 endpoints probed OK. Pending review. |
| **awesome-mcp-servers (punkpeye)** | ✅ PR Created | PR #14281 — Finance & Fintech section |
| **mcpservers.org** | ✅ Submitted | Form submitted via browser |
| **GitHub Topics** | ✅ Added | 10 topics: x402, mcp-server, ai-agents, pay-per-call, usdc, crypto-payments, ai-microservices, agent-discovery, llms-txt, base-chain |
| **smithery.yaml** | ✅ Created | Config file added for future Smithery publishing |

## ⏳ Needs Manual Action (login / payment)

| Directory | Action Needed | Link |
|-----------|--------------|------|
| **Smithery** | GitHub login → `smithery publish`. Now easier: remote MCP URL `https://agentpay.help/mcp` means no build needed. | https://smithery.ai/login |
| **curatedmcp.com** | Login required (Google or GitHub) → "Submit your server" | https://www.curatedmcp.com/publish |
| **Glama.ai** | Sign-up required → "Add Server" | https://glama.ai/mcp/servers |
| **mcp.so** | $39 paid submission | https://mcp.so/submit |
| **satring.com** | Requires x402 payment to Satring; their payment service is currently DOWN (HTTP 502). Retry later. | https://satring.com/submit |
| **PulseMCP** | Submissions paused (reworking ingestion) | https://www.pulsemcp.com |
| **Product Hunt** | Needs manual launch | https://www.producthunt.com |
| **Show HN** | Needs manual post | https://news.ycombinator.com/submit |
| **MCPize / OpenTools / DevHunt** | No submission API found | — |

## ❌ Dead / Unavailable

| Directory | Status |
|-----------|--------|
| **mcptrove.com** | Read-only demo template — "Submissions are disabled in this read-only demo." Not a live directory. |
| **wmcp.sh** | Submission API exists (`/api/v1/directory/submit`) but returns HTTP 500 on every valid payload — server-side bug on their end. |
| **agentndx.ai** | Read-only API (1306 servers, all MCP-source). No submit endpoint; syncs from MCP Registry. AgentPay not yet picked up. |
| **ToolHunt.ai** | Domain for sale ($4,500) |
| **agent402.directory** | Empty/not responding |
| **MCP Hub (mcphub.io)** | Blocked/unreachable |
| **MCP Playbooks** | Blocked/unreachable |

## 🔧 Server Improvements Applied (this session)

**Discovery spec compliance (this is what unlocks auto-indexing):**
- `/.well-known/x402` — rewritten to the **x402scan spec shape**: `version: 1`, `resources[]`, `ownershipProofs[]`. Was advertising only **7 of 22** services — now all 22.
- `/openapi.json` — added **`x-payment-info`** (`protocols: ["x402"]`, `price.mode/currency/amount`) and top-level **`x-discovery.ownershipProofs`** per the x402scan DISCOVERY.md requirements.
- 402 challenges already Bazaar-compliant (`extensions.bazaar.info` + atomic amount in `accepts`) — verified on mainnet.

**New: remote MCP server** (`src/mcp-http.js`, mounted at `POST /mcp`)
- **All 22 services exposed as MCP tools** over Streamable HTTP — no install, no API keys.
- Previously the stdio server only exposed 3 of 22 tools.
- Reads the x402 v2 challenge from the **`PAYMENT-REQUIRED` response header** (base64 JSON), not the body — returns a fully-populated challenge to the calling agent so it can pay and retry.
- Verified: `tools/list` → 22 tools on both localhost and https://agentpay.help/mcp.

**Discovery surfaces updated for MCP:**
- `/.well-known/mcp.json` — now lists both the remote (streamable-http) and stdio servers
- `/.well-known/agent.json` — added `mcp` block + `mcpEndpoint` discovery link; `capabilities` = 22
- `/llms.txt` — documents the remote MCP endpoint
- MCP Registry auth keypair rotated (HTTP domain-verification on agentpay.help)

**Earlier fixes retained:**
- `ollamaChat()` — `AbortSignal.timeout(120000)` for slow model loads
- `/v1/summarize-free` — working with llama3.2:3b

## Open Items

1. **Smithery** — login with GitHub → publish using remote URL `https://agentpay.help/mcp`
2. **curatedmcp.com** — login → submit
3. **Glama.ai** — sign up → Add Server
4. **satring.com** — retry when their payment service recovers
5. **Monitor** PR #14281, mcp.directory review, payapi.market review, minia2a review, x402-list review
6. **x402scan merchant page** — verify AgentPay appears in the public index: tryponcho.com/m/agentpay.help
