# Glama directory build: stdio MCP server (mcp-server.js)
# MCP speaks JSON-RPC over stdio — no ports exposed.
FROM node:22-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Server entrypoint
COPY mcp-server.js ./

# Required at runtime (set with `docker run -e ...`):
#   BUYER_PRIVATE_KEY - hex private key funding x402 USDC payments
# Optional:
#   SHOP_URL          - x402 seller base URL (default: https://agentpay.help)
#   PAYMENT_NETWORK   - default: eip155:84532 (Base Sepolia)
ENV NODE_ENV=production

# Non-root user
USER node

ENTRYPOINT ["node", "mcp-server.js"]
