// Sign minia2a publish message and submit AgentPay service listing.
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'node:fs';

const wallet = JSON.parse(fs.readFileSync('/root/x402-shop/mainnet-wallet.json', 'utf8'));
const account = privateKeyToAccount(wallet.private_key);

const payload = {
  name: 'AgentPay',
  description: '22 pay-per-call AI microservices over x402: summarize, classify-insurance, extract, translate, sentiment, code-review, token-safety, compliance. POST JSON to https://agentpay.help/v1/<service>, pay 402 in USDC on Base.',
  endpoint: 'https://agentpay.help/v1/summarize',
  price_cents: 1,
  category: 'premium',
  wallet: account.address,
};

const message = 'minia2a publish: ' + account.address;
const signature = await account.signMessage({ message });
payload.signature = signature;

console.log('wallet:', account.address);
console.log('message:', message);
console.log('sig:', signature.slice(0, 20) + '...');

const res = await fetch('https://minia2a.uk/api/v1/publish-service', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
});
const text = await res.text();
console.log('HTTP', res.status);
console.log(text.slice(0, 900));
