# Glama directory build: stdio MCP server exposing the full AgentPay catalog.
# MCP speaks JSON-RPC over stdio — no ports exposed.
#
# The server starts without any environment variables and lists every tool
# (directory crawlers and build introspection happen before a wallet exists).
# Provide BUYER_PRIVATE_KEY at runtime to have calls paid automatically.
FROM node:22-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Server entrypoint + shared catalog/transport modules
COPY mcp-server.js ./
COPY src/services.js src/mcp-http.js ./src/

# Optional at runtime (set with `docker run -e ...`):
#   BUYER_PRIVATE_KEY - hex private key funding x402 USDC payments (catalog-only mode without it)
#   SHOP_URL          - x402 seller base URL (default: https://agentpay.help)
#   PAYMENT_NETWORK   - default: eip155:8453 (Base mainnet)
ENV NODE_ENV=production

# Non-root user
USER node

ENTRYPOINT ["node", "mcp-server.js"]
