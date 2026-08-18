# AgentPay.help — Cloudflare Setup Guide

## Step 1: Add Domain to Cloudflare

1. Go to https://dash.cloudflare.com
2. Click "Add a Site"
3. Enter: `agentpay.help`
4. Select "Free" plan
5. Cloudflare will scan existing DNS records

## Step 2: Update Nameservers

Cloudflare will give you 2 nameservers (e.g., `anna.ns.cloudflare.com`). 

**At your domain registrar (where you bought agentpay.help):**
1. Go to DNS settings
2. Replace existing nameservers with Cloudflare's
3. Wait 5-10 minutes for propagation

## Step 3: Add DNS Records

In Cloudflare dashboard → DNS → Records:

| Type | Name | Content | Proxy | TTL |
|------|------|---------|-------|-----|
| A | @ | 142.170.148.140 | ✅ Proxied | Auto |
| CNAME | www | agentpay.help | ✅ Proxied | Auto |

**Note:** 142.170.148.140 is your current public IP (from the Cloudflare tunnel).

## Step 4: Enable SSL/TLS

1. Go to SSL/TLS → Overview
2. Set to "Full (Strict)"
3. Go to SSL/TLS → Edge Certificates
4. Enable "Always Use HTTPS"
5. Enable "Automatic HTTPS Rewrites"

## Step 5: Set Up Redirect Rules (Optional)

Go to Rules → Redirect Rules:

**Redirect www to apex:**
- When: `www.agentpay.help/*`
- Then: `https://agentpay.help/${url}`
- Status: 301

## Step 6: Update Server Configuration

Once DNS propagates, update the server to use the new domain:

```bash
# In /root/x402-shop/.env
PUBLIC_URL=https://agentpay.help
```

## Step 7: Update Cloudflare Tunnel (If Using)

If you're using Cloudflare Tunnel instead of direct DNS:

1. Go to Network → Tunnels
2. Edit your tunnel
3. Add public hostnames:
   - `agentpay.help` → `https://agentpay.help`
   - `www.agentpay.help` → `https://agentpay.help`

## Verification

After setup, test:

```bash
# Test DNS
dig agentpay.help +short

# Test HTTPS
curl -I https://agentpay.help

# Test the API
curl -s https://agentpay.help/.well-known/x402
```

## Expected Results

- ✅ https://agentpay.help loads the landing page
- ✅ https://agentpay.help/.well-known/x402 returns service catalog
- ✅ SSL certificate is valid
- ✅ Redirects work (www → apex)

---

*Last updated: 2026-08-17*
