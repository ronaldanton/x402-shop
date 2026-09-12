# AgentPay Directory & Marketplace Submissions

**Last updated:** 2026-09-12T20:47 UTC
**Repo:** https://github.com/ronaldanton/x402-shop
**Live URL:** https://agentpay.help

## ✅ Submitted / Published

| Directory | Status | Details |
|-----------|--------|---------|
| **MCP Registry** | ✅ Published | `io.github.ronaldanton/agentpay` — live at registry.modelcontextprotocol.io |
| **x402-list.com** | ✅ Submitted | Submission ID: `a6a0990c-c653-4faf-80ba-3e40ced2c56b`. 8/15 endpoints probed OK. Pending human review. |
| **awesome-mcp-servers (punkpeye)** | ✅ PR Created | PR #14281 — AgentPay added to Finance & Fintech section |
| **mcpservers.org** | ✅ Submitted | Form submitted via browser |
| **GitHub Topics** | ✅ Added | 10 topics: x402, mcp-server, ai-agents, pay-per-call, usdc, crypto-payments, ai-microservices, agent-discovery, llms-txt, base-chain |
| **smithery.yaml** | ✅ Created | Config file added to repo for future Smithery publishing |

## ⏳ Needs Manual Action

| Directory | Action Needed | Link |
|-----------|--------------|------|
| **Smithery** | GitHub login required → publish via CLI `smithery publish` | https://smithery.ai/login |
| **Glama.ai** | Sign-up required → "Add Server" button | https://glama.ai/mcp/servers |
| **mcp.so** | $39 paid submission | https://mcp.so/submit |
| **PulseMCP** | Submissions paused (reworking ingestion) | https://www.pulsemcp.com |
| **MCPize** | No submission API found (404 on /publish) | https://mcpize.com |
| **OpenTools** | No submission API found | https://opentools.com |
| **DevHunt** | No submission API found | https://devhunt.org |
| **Product Hunt** | Needs manual launch | https://www.producthunt.com |
| **Show HN** | Needs manual post | https://news.ycombinator.com/submit |

## ❌ Dead / Unavailable

| Directory | Status |
|-----------|--------|
| **ToolHunt.ai** | Domain for sale ($4,500) |
| **agent402.directory** | Empty/not responding |
| **MCP Hub (mcphub.io)** | Blocked/unreachable |
| **MCP Playbooks** | Blocked/unreachable |

## 🔧 Server Fixes Applied

- `ollamaChat()` — added `AbortSignal.timeout(120000)` for slow model loads
- `/v1/summarize-free` — now working with llama3.2:3b (pulled via Ollama)
- Added `/.well-known/x402list.txt` for x402-list.com ownership verification
- Debug logging added to summarize-free error path

## Next Steps

1. **Login to Smithery** with GitHub → run `smithery publish`
2. **Sign up on Glama.ai** → Add Server with GitHub repo URL
3. **Monitor PR #14281** on punkpeye/awesome-mcp-servers
4. **Check x402-list.com** review status (7-day window)
5. **Consider $39 mcp.so** submission for visibility
6. **Launch on Product Hunt** / Show HN for broader exposure
