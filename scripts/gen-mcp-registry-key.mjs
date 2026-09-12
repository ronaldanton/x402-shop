#!/usr/bin/env node
// Generate an Ed25519 keypair for MCP Registry HTTP domain verification and
// publish the public key at /.well-known/mcp-registry-auth.
// Private key is written to a 0600 file and never printed.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const KEY_FILE = "/root/.config/mcp-publisher/agentpay.key";
const AUTH_FILE = "/root/x402-shop/.well-known/mcp-registry-auth";

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const rawPub = publicKey.export({ type: "spki", format: "der" }).slice(-32);
const seed = privateKey.export({ type: "pkcs8", format: "der" }).slice(-32);
// Go's ed25519.PrivateKey is seed || pubkey (64 bytes)
const privHex = Buffer.concat([seed, rawPub]).toString("hex");
const pubB64 = rawPub.toString("base64");

fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
fs.writeFileSync(KEY_FILE, privHex, { mode: 0o600 });
fs.writeFileSync(AUTH_FILE, `v=MCPv1; k=ed25519; p=${pubB64}\n`);

console.log("private key file:", KEY_FILE, "mode 0600");
console.log("written auth file:", AUTH_FILE);
console.log("auth file content:", fs.readFileSync(AUTH_FILE, "utf8").trim());
console.log("priv hex length (chars):", privHex.length);
