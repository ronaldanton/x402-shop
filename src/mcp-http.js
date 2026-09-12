// mcp-http.js — Remote MCP (Model Context Protocol) endpoint over Streamable HTTP.
//
// Exposes ALL AgentPay services as MCP tools at POST /mcp so any MCP-capable
// client (Claude Desktop, Cursor, VS Code, ChatGPT connectors, Codex, Gemini CLI)
// can discover and call them without cloning a repo or installing npm packages.
//
// Payment model:
//   - If AGENTPAY_BUYER_KEY is set, calls are paid automatically from that wallet.
//   - Otherwise the tool returns the live x402 challenge (HTTP 402 body) so an
//     x402-capable agent can sign the payment itself and retry.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

// ── Parse "type (hint)" descriptions from SERVICES into zod schemas ────────────
function zodFor(desc) {
  const d = String(desc || "").toLowerCase();
  if (d.startsWith("string[]")) return z.array(z.string());
  if (d.startsWith("number[]")) return z.array(z.number());
  if (d.startsWith("number") || d.startsWith("integer")) return z.number();
  if (d.startsWith("boolean") || d.startsWith("bool")) return z.boolean();
  if (d.startsWith("object")) return z.record(z.string(), z.any());
  return z.string();
}

export function buildInputSchema(bodySpec) {
  const shape = {};
  for (const [key, desc] of Object.entries(bodySpec || {})) {
    const required = /required/i.test(desc) && !/optional/i.test(desc.slice(0, 40));
    const t = zodFor(desc);
    shape[key] = required ? t : t.optional();
  }
  return shape;
}

// ── Create one MCP server instance wired to a paid-call executor ───────────────
export function createMcpServer({ services, baseUrl, pay, publicBase }) {
  const server = new McpServer(
    { name: "agentpay", version: "1.0.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "AgentPay exposes pay-per-call AI microservices settled in USDC on Base mainnet via the " +
        "x402 (HTTP 402) protocol. Each tool maps to one HTTP endpoint. Tools list their price in " +
        "USD; payment is handled automatically when this server holds a funded wallet, otherwise " +
        "the tool returns the payment challenge for the caller to sign.",
    }
  );

  for (const s of services) {
    const name = s.path.replace("/v1/", "").replace(/\//g, "-");
    const priceNote = `${s.price} USDC per call`;
    server.registerTool(
      name,
      {
        title: name,
        description: `${s.summary} (${priceNote})`,
        inputSchema: buildInputSchema(s.body),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async (args) => {
        try {
          const r = await pay(`${baseUrl}${s.path}`, args);
          if (r && r.paymentRequired) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      payment_required: true,
                      price: s.price,
                      endpoint: `${publicBase}${s.path}`,
                      x402_challenge: r.challenge,
                      payment_required_header: r.paymentRequiredHeader,
                      hint:
                        "Sign the x402 payment with your wallet and re-POST the endpoint with the X-PAYMENT header.",
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }
          return {
            content: [{ type: "text", text: JSON.stringify(r, null, 2) }],
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err?.message || String(err)}` }],
            isError: true,
          };
        }
      }
    );
  }

  return server;
}

// ── Express handler: stateless Streamable HTTP ────────────────────────────────
export function mountMcp(app, opts) {
  const { services, publicBase } = opts;

  // Executor: pay with a configured buyer key if present, else surface the 402.
  let paidFetch = null;
  const buyerKey = process.env.AGENTPAY_BUYER_KEY;

  const pay = async (url, body) => {
    if (!paidFetch && buyerKey) {
      const [{ wrapFetchWithPayment, x402Client }, { ExactEvmScheme }, { privateKeyToAccount }] =
        await Promise.all([
          import("@x402/fetch"),
          import("@x402/evm/exact/client"),
          import("viem/accounts"),
        ]);
      const signer = privateKeyToAccount(buyerKey);
      const client = x402Client.fromConfig({
        schemes: [{ network: "eip155:*", client: new ExactEvmScheme(signer) }],
      });
      paidFetch = wrapFetchWithPayment(globalThis.fetch, client);
    }
    const f = paidFetch || globalThis.fetch;
    const res = await f(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (res.status === 402) {
      // x402 v2 carries the challenge in the PAYMENT-REQUIRED header (base64 JSON).
      // Fall back to the response body for older/facilitator variants.
      const hdr = res.headers.get("PAYMENT-REQUIRED") || res.headers.get("payment-required");
      let challenge = null;
      if (hdr) {
        try {
          challenge = JSON.parse(Buffer.from(hdr, "base64").toString("utf8"));
        } catch {
          challenge = { raw: hdr };
        }
      }
      if (!challenge || Object.keys(challenge).length === 0) challenge = data;
      const accepts = Array.isArray(challenge?.accepts) ? challenge.accepts[0] : undefined;
      return {
        paymentRequired: true,
        challenge: accepts ? { ...challenge, accepts: [accepts] } : challenge,
        paymentRequiredHeader: hdr || undefined,
      };
    }
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
  };

  const handle = async (req, res) => {
    const server = createMcpServer({
      services,
      baseUrl: `http://127.0.0.1:${process.env.PORT || 4021}`,
      pay,
      publicBase,
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: e.message }, id: null });
      }
    }
  };

  app.post("/mcp", handle);

  // GET/DELETE are not supported in stateless mode.
  app.get("/mcp", (req, res) =>
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method Not Allowed. Use POST for Streamable HTTP MCP." },
      id: null,
    })
  );
  app.delete("/mcp", (req, res) => res.status(405).end());

  // Metadata for directory crawlers
  app.get("/.well-known/mcp-endpoint.json", (req, res) =>
    res.json({
      schema: "mcp/endpoint/v1",
      name: "agentpay",
      title: "AgentPay — 22 pay-per-call AI microservices via x402",
      description:
        "Remote MCP server (Streamable HTTP) exposing 22 AI microservices settled in USDC on Base via the x402 protocol.",
      url: `${publicBase}/mcp`,
      transport: { type: "streamable-http", url: `${publicBase}/mcp`, method: "POST" },
      auth: "none",
      payment: {
        protocol: "x402",
        network: "eip155:8453",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        note: "Pay-per-call. No account or API key required.",
      },
      capabilities: { tools: { count: services.length } },
      repository: "https://github.com/ronaldanton/x402-shop",
      homepage: publicBase,
    })
  );
}
