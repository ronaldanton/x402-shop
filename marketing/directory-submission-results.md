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
| **awesome-x402-mcp-services** (Recall-Kitchen) | ✅ PR Created | PR #72 — added under **Business data**, framed on the insurance/document-analysis job (their rules exclude "crypto/trading/DeFi/token screens" and "generic 20–500 tool dumps"). |
| **awesome-agentic-commerce** (Merit Systems) | ✅ PR Created | PR #698 — added to **Ecosystem** beside the other x402 service providers. Merit Systems runs x402scan, so this is the highest-leverage list. Body corrected to drop an npm link that turned out to be another project's package. |
| **gold-402** (Haustorium12) | ✅ PR Created | PR #211 — three distinct services, one entry each in three sections: Summarize → AI Services, Insurance Lead Analysis → Business Intelligence, Token Safety → Crypto & DeFi Data. gold-402 is the curated 300-entry front for a 29,000-entry catalog sourced from CDP Bazaar + agentic.market. |
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

## 2026-09-12 (later) — index verification + wire-format fixes

### ✅ Confirmed live / newly indexed
| Surface | Evidence |
|---------|----------|
| **x402scan (Merit Systems)** | `POST /api/trpc/public.resources.registerFromOrigin {"origin":"https://agentpay.help"}` → `success:true, registered:22, total:22, failed:0, source:"openapi", originId:"b9b6665a-037e-4fad-9bf7-6132c30058f9"`. `checkDiscovery` also returns `found:true, source:"openapi", resourceCount:22`. |
| **CDP Bazaar (Coinbase)** | `POST https://api.cdp.coinbase.com/platform/v2/x402/validate` (no API key) → **all 22 routes `valid:true`, `simulation.outcome:"accepted"`, 0 preflight failures** (25 checks each). Report saved at `/tmp/cdp-report.json`. |
| **MCP Registry (official)** | `io.github.ronaldanton/agentpay` — status `active`, remote `https://agentpay.help/mcp`, published 2026-09-12T19:47:50Z. |
| **nohumans.directory** | All 4 listings flipped `unverified` → **`verified`** (score 1.0, x402 v2, 0 fails). |
| **AgentPay hub card** | live on `my-ai-projects` (:8765). |

### 🔧 Fixes shipped
1. **Dual-format 402 (rev `bf093fc`)** — `@x402/express` v2 sends the challenge only in the base64 `payment-required` header with body `{}`; a live peer (`api.onesource.io`) puts the full challenge in **both** header and body and repeats v1 field names. Agents/indexers that read only the body saw nothing and could not pay. Our 402 body now mirrors the header and adds v1 aliases (`maxAmountRequired`, `currency`, `recipient`) plus `meta.agentpay.how_to_pay`. Verified: header==body on all sampled routes, free routes unaffected.
2. **Generated bazaar declarations from one spec table** — every route now ships a real input/output JSON Schema and a realistic example body (CDP wants **values** in `info.input.body`, x402scan wants the schema). Descriptions gained "Use when:" guidance and stay under CDP's **500-char** hard limit (which causes verify/settle rejection). A self-inconsistent example (`minLength: 200` vs a 100-char example) was caught by CDP's own preflight and fixed.

### 🚧 Remaining gates
- **CDP Bazaar indexing** fires only after a **settled** payment through the **CDP Facilitator** (needs a CDP API key = human signup). Our facilitator is `x402.org/facilitator`, which advertises `extensions: [builder-code, eip2612GasSponsoring, erc20ApprovalGasSponsoring]` — **no bazaar** — and its own catalog paths return 404. `agentic.market` is built on Bazaar, so it follows.
- **PayAI Bazaar** catalogs on `/verify` (no funds moved) — would require pointing `FACILITATOR_URL` at PayAI. Not done: switching the facilitator on the only working payment path is unverifiable without a funded payer.
- **PulseMCP / Glama / Smithery / curatedmcp** — API needs a key (`api.pulsemcp.com/v0.1` → 401, Glama → 401) or an account login.
- **Registry auth key rotated**: `/.well-known/mcp-registry-auth` now serves a fresh ed25519 key; the matching 32-byte seed is stored at `/root/.config/mcp-publisher/agentpay.key` (0600). Login verified: `login http --domain agentpay.help` → `auth_method_sub: agentpay.help`, permission `publish` on `help.agentpay/*`. Publishing under `help.agentpay/*` is blocked by the registry because the remote URL is already claimed by the live `io.github.ronaldanton/agentpay` entry — that entry is the correct one.

## 2026-09-13 — yzfly PR, TensorBlock issue, Glama repo prep, PulseMCP status

| Surface | Action | Result |
|---|---|---|
| yzfly/Awesome-MCP-ZH | PR filed (金融与加密货币 section, after xpaysh/awesome-x402 row) | https://github.com/yzfly/Awesome-MCP-ZH/pull/569 OPEN |
| TensorBlock/awesome-mcp-servers | Issue-form content filed via REST (browser GH session logged out) | https://github.com/TensorBlock/awesome-mcp-servers/issues/2363 OPEN, label server-submission |
| Glama | Repo-side prep committed: Dockerfile (node:22-alpine, stdio ENTRYPOINT, verified build + MCP initialize handshake in docker) + glama.json maintainer decl | ronaldanton/x402-shop commits on master; listing page itself requires account sign-up (captcha) — PENDING user |
| punkpeye/awesome-mcp-servers #14281 | Progress comment posted (Dockerfile + glama.json + MCP Registry active) | comment 5649525900; badge to be added once Glama listing exists |
| PulseMCP | Submission attempt | PAUSED since 2026-09-03 — they auto-ingest the Official MCP Registry (we are active: io.github.ronaldanton/agentpay), so no action needed until they reopen |

Open PRs awaiting review: xpaysh/awesome-x402 #1353 · Recall-Kitchen/awesome-x402-mcp-services #72 · Merit-Systems/awesome-agentic-commerce #698 · Haustorium12/gold-402 #211 (bot PASSED) · punkpeye #14281 · yzfly #569. TensorBlock issue #2363 pending triage. mcpservers.org free submission pending review.

## 2026-09-13 (later) — 6 demand-driven services added (22 → 28)
| Surface | Action | Result |
|---|---|---|
| Product | Researched CDP Bazaar trials + x402scan + agent-economy demand data → built web-search ($0.01), wallet memory KV ($0.005), geocode ($0.005), eth-gas ($0.003), prediction-market ($0.01), deep-research premium ($0.25) | All handlers live-verified (dev loopback + upstreams); prod paywalled 402 on all 6; dual-format 402 body OK |
| CDP Bazaar | Full re-validation 28 routes | 28/28 accepted |
| x402scan | re-registerFromOrigin | 28/28 registered (originId b9b6665a…f9 unchanged) |
| MCP Registry | version 1.1.0 → 1.2.0 re-publish | BLOCKED: registry DNS auth NXDOMAINs agentpay.help (their resolver 34.118.224.10); v1.1.0 entry still ACTIVE; retry later — HTTP login works but maps to help.agentpay/* namespace (wrong identity, not used) |
| awesome-x402 #1353 | body updated 7→28 services, pricing $0.003–$0.25 | pushed |
| yzfly PR #569 | entry updated 22→28 服务, new pricing | pushed |
| mcp-server/README/hub | counts 22→28 everywhere; README pricing table regenerated from source (28 rows) | done |
| nohumans.directory | 6 NEW listings (web-search, memory, geocode, eth-gas, prediction-market, deep-research) + 4 legacy descriptions 22→28 | all 201/200; claim tokens in marketing/nohumans-batch2.json |
| MCP Registry | retry publish v1.2.0 | still 403 — their DNS auth NXDOMAINs agentpay.help; v1.1.0 entry ACTIVE; retry later |
