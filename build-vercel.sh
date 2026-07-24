#!/usr/bin/env bash
# Produce a Vercel Build Output API bundle (.vercel/output) for this site, then
# deploy it with:  bunx vercel deploy --prebuilt
#
# Why Build Output API instead of Vercel's Vite/framework detection:
#  - TanStack Start emits a host-agnostic fetch handler (dist/server/server.js)
#    that dynamic-imports its own ./assets chunks and externalizes node deps.
#    Letting Vercel trace/detect that is fragile.
#  - Bundling it into one self-contained file (deps + dynamic chunks inlined) in a
#    single render.func removes all tracing/detection risk. vercel-entry.ts adapts
#    the Node (req,res) launcher to the web fetch handler.
set -euo pipefail
cd "$(dirname "$0")"
umask 002

echo "[1/3] vite build (light — safe under the sandbox memory cap)"
bun run build

echo "[2/3] assemble .vercel/output (Build Output API v3)"
rm -rf .vercel/output
mkdir -p .vercel/output/functions/render.func
cp -R dist/client .vercel/output/static
rm -f .vercel/output/static/index.html   # SSR owns "/", not a static shell

echo "[3/3] bundle SSR handler + deps into the render function"
bun build vercel-entry.ts --target node \
  --outfile .vercel/output/functions/render.func/index.mjs

# Create a separate webhook handler function
mkdir -p .vercel/output/functions/webhook.func
cat > .vercel/output/functions/webhook.func/index.mjs << 'WHEND'
import { createHmac } from "node:crypto";

function verifyStripeSignature(payload, signature, secret) {
  const parts = signature.split(",").reduce((acc, part) => {
    const [k, v] = part.split("=");
    acc[k.trim()] = v;
    return acc;
  }, {});
  const hmac = createHmac("sha256", secret);
  hmac.update(`${parts.t}.${payload}`);
  return hmac.digest("hex") === parts.v1;
}

async function getBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

async function handleSyncSubscription(req, res) {
  try {
    const body = await getBody(req);
    const { customerId, status, tier, periodEnd } = JSON.parse(body);
    
    // Store in env var (simple approach — uses process.env as temp storage)
    // In production, this would use a real database
    const subs = JSON.parse(process.env.SUBSCRIPTIONS || "{}");
    subs[customerId] = { status, tier, periodEnd, updated: new Date().toISOString() };
    process.env.SUBSCRIPTIONS = JSON.stringify(subs);
    
    console.log("[SyncSub] Stored subscription for", customerId, tier);
    
    res.statusCode = 200;
        res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    console.error("[SyncSub] Error:", e);
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Internal error" }));
  }
}

export default async function handler(req, res) {
  // Handle both /api/webhook and /api/sync-subscription
  const url = req.url || "";
  
  if (url.includes("/api/sync-subscription") && req.method === "POST") {
    return handleSyncSubscription(req, res);
  }
  
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const signature = req.headers["stripe-signature"];
  if (!signature) {
    res.statusCode = 400;
        res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Missing stripe-signature" }));
    return;
  }

  try {
    const body = await getBody(req);
    const secret = process.env.STRIPE_WEBHOOK_SECRET || "";
    
    // Verify signature
    if (!verifyStripeSignature(body, signature, secret)) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Invalid signature" }));
      return;
      }

    const event = JSON.parse(body);
    console.log("[Webhook]", event.type);

    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const sub = event.data.object;
      const PREMIER = "price_1TwOtyExpuSFJTtEmSxDgmmp";
      const tier = sub.items?.data?.[0]?.price?.id === PREMIER ? "premier" : "pro";
      const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
      const base = `https://${req.headers.host}`;

      await fetch(`${base}/api/sync-subscription`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customerId: sub.customer, status: sub.status, tier, periodEnd }),
      });

      // Record referral conversion if subscription has referral_code metadata
      const referralCode = sub.metadata?.referral_code;
      if (referralCode && event.type === "customer.subscription.created") {
        fetch(`${base}/api/referral-conversion`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: referralCode, bountyAmountCents: 500 }),
        }).catch(e => console.error("[Webhook] Referral conversion error:", e));
      }
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const base = `https://${req.headers.host}`;
      await fetch(`${base}/api/sync-subscription`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customerId: sub.customer, status: "canceled" }),
      });
      }

    res.statusCode = 200;
        res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ received: true }));
  } catch (e) {
    console.error("[Webhook] Error:", e);
    res.statusCode = 400;
        res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Webhook error" }));
  }
}
WHEND

cat > .vercel/output/functions/webhook.func/.vc-config.json << 'JSON'
{ "runtime": "nodejs22.x", "handler": "index.mjs", "launcherType": "Nodejs" }
JSON

# Create a separate checkout handler function
mkdir -p .vercel/output/functions/checkout.func
cat > .vercel/output/functions/checkout.func/index.mjs << 'CHEND'
export default async function handler(req, res) {
  const url = req.url || "";

  // GET /api/tier?customerId=... — lookup subscription tier
  if (url.includes("/api/tier") && req.method === "GET") {
    const params = new URL(url, "http://localhost").searchParams;
    const customerId = params.get("customerId");
    if (!customerId) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ tier: "free", error: "Missing customerId" }));
      return;
    }
    try {
      const key = process.env.STRIPE_SECRET_KEY || "";
      const stripeRes = await fetch(
        `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=active&limit=1`,
        { headers: { "Authorization": "Basic " + Buffer.from(key + ":").toString("base64") } },
      );
      const data = await stripeRes.json();
      const sub = data.data?.[0];
      const priceId = sub?.items?.data?.[0]?.price?.id;
      const PREMIER_PRICE = "price_1TwOtyExpuSFJTtEmSxDgmmp";
      const tier = priceId === PREMIER_PRICE ? "premier" : (sub ? "pro" : "free");
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ tier }));
    } catch (e) {
      console.error("[Tier] Lookup failed:", e);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ tier: "free" }));
    }
    return;
  }

  // GET /api/session?session_id=... — look up customer ID after checkout
  if (url.includes("/api/session") && req.method === "GET") {
    const params = new URL(url, "http://localhost").searchParams;
    const sessionId = params.get("session_id");
    const email = params.get("email");
    
    // Lookup by email
    if (email) {
      try {
        const key = process.env.STRIPE_SECRET_KEY || "";
        const stripeRes = await fetch(
          `https://api.stripe.com/v1/customers/search?query=email:'${encodeURIComponent(email)}'&limit=1`,
          { headers: { "Authorization": "Basic " + Buffer.from(key + ":").toString("base64") } },
        );
        const data = await stripeRes.json();
        const customer = data.data?.[0];
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ 
          customerId: customer?.id || null,
        }));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "Lookup failed" }));
      }
      return;
      }
    
    // Lookup by session ID
    if (!sessionId) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Missing session_id or email" }));
      return;
      }
    try {
      const key = process.env.STRIPE_SECRET_KEY || "";
      const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
        headers: { "Authorization": "Basic " + Buffer.from(key + ":").toString("base64") },
      });
      const session = await stripeRes.json();
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ 
        customerId: session.customer,
        subscriptionId: session.subscription,
      }));
      } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Lookup failed" }));
      }
    return;
  }

  // POST /api/checkout — create checkout session
  if (req.method !== "POST") {
    res.statusCode = 405;
        res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const body = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      req.on("error", reject);
    });
    const { tier, referralCode } = JSON.parse(body || "{}");
    const priceId = tier === "premier"
      ? "price_1TwOtyExpuSFJTtEmSxDgmmp"
      : "price_1TwOtrExpuSFJTtEH7NTOh0O";
    const host = req.headers.host || "lastnotesold.com";
    const proto = req.headers["x-forwarded-proto"] || "https";
    const key = process.env.STRIPE_SECRET_KEY || "";

    const params = new URLSearchParams({
      "mode": "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      "success_url": `${proto}://${host}/?subscribed=true`,
      "cancel_url": `${proto}://${host}/pricing`,
      "allow_promotion_codes": "true",
    });
    if (referralCode) {
      params.set("metadata[referral_code]", referralCode);
    }

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + Buffer.from(key + ":").toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();
    if (session.error) {
      console.error("[Checkout] Stripe error:", session.error);
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: session.error.message || "Stripe error" }));
      return;
      }
    res.statusCode = 200;
        res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ url: session.url }));
      } catch (e) {
        console.error("[Checkout] Error:", e);
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "Checkout failed" }));
      }
      }
CHEND

cat > .vercel/output/functions/checkout.func/.vc-config.json << 'JSON'
{ "runtime": "nodejs22.x", "handler": "index.mjs", "launcherType": "Nodejs" }
JSON

cat > .vercel/output/functions/render.func/.vc-config.json <<'JSON'
{ "runtime": "nodejs22.x", "handler": "index.mjs", "launcherType": "Nodejs", "supportsResponseStreaming": true, "maxDuration": 30 }
JSON

# Create referral API function
mkdir -p .vercel/output/functions/referral.func
bun build referral-entry.mjs --target node --outfile .vercel/output/functions/referral.func/index.mjs
cat > .vercel/output/functions/referral.func/.vc-config.json << 'JSON'
{ "runtime": "nodejs22.x", "handler": "index.mjs", "launcherType": "Nodejs" }
JSON

# Create redirect handler for short referral codes
mkdir -p .vercel/output/functions/redirect.func
cat > .vercel/output/functions/redirect.func/index.mjs << 'REDIRECTEND'
export default async function handler(req, res) {
  const url = req.url || "";
  const params = new URL(url, "http://localhost").searchParams;
  const code = params.get("code") || "";

  if (!code) {
    res.statusCode = 302;
    res.setHeader("location", "/");
    res.end();
    return;
  }

  const TURSO_URL = (process.env.TEAM_DB_URL || "").replace("libsql://", "https://");
  const TURSO_TOKEN = process.env.TEAM_DB_AUTH_TOKEN || "";

  if (!TURSO_URL || !TURSO_TOKEN) {
    res.statusCode = 302;
    res.setHeader("location", "/?ref=" + encodeURIComponent(code));
    res.end();
    return;
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(TURSO_URL + "/v2/pipeline", {
      method: "POST",
      headers: { "Authorization": "Bearer " + TURSO_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          { type: "execute", stmt: { sql: "SELECT code FROM referrals WHERE code = ?", args: [{ type: "text", value: code }] } },
          { type: "close" },
        ],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const j = await r.json();
    const rows = j.results?.[0]?.response?.result?.rows || [];

    if (rows.length > 0) {
      fetch(TURSO_URL + "/v2/pipeline", {
        method: "POST",
        headers: { "Authorization": "Bearer " + TURSO_TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            { type: "execute", stmt: { sql: "INSERT INTO referral_clicks (code) VALUES (?)", args: [{ type: "text", value: code }] } },
            { type: "close" },
          ],
        }),
      }).catch(() => {});
      res.statusCode = 302;
      res.setHeader("location", "/?ref=" + encodeURIComponent(code));
      res.end();
    } else {
      res.statusCode = 302;
      res.setHeader("location", "/");
      res.end();
    }
  } catch (e) {
    res.statusCode = 302;
    res.setHeader("location", "/?ref=" + encodeURIComponent(code));
    res.end();
  }
}
REDIRECTEND

cat > .vercel/output/functions/redirect.func/.vc-config.json << 'JSON'
{ "runtime": "nodejs22.x", "handler": "index.mjs", "launcherType": "Nodejs" }
JSON

# Create chat API function
mkdir -p .vercel/output/functions/chat.func
cat > .vercel/output/functions/chat.func/index.mjs << 'CHATEND'
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }
  try {
    const body = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      req.on("error", reject);
    });
    const { message } = JSON.parse(body || "{}");
    if (!message) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Missing message" }));
      return;
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ reply: "I'm currently offline. Please email support@lastnotesold.com for help." }));
      return;
    }
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a helpful support assistant for LastNoteSold, a real-time paper money pricing tool for live streamers on Whatnot, TikTok Live, and eBay Live. LastNoteSold pulls live pricing data from eBay Active listings, Greysheet/CPG dealer pricing, and Sold-Comps. Plans: Free (10 lookups/day, eBay only, 3 comps), Pro ($14.99/mo, + Greysheet CPG, 20 comps), Premier ($24.99/mo, + Sold-Comps, 20 comps). Keep answers concise and friendly." },
          { role: "user", content: message },
        ],
        max_tokens: 300,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await openaiRes.json();
    const reply = data.choices?.[0]?.message?.content || "Sorry, I couldn't process that. Try the FAQ below or email support@lastnotesold.com.";
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ reply }));
  } catch (e) {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ reply: "I'm having trouble right now. Check the FAQ below or email support@lastnotesold.com for help." }));
  }
}
CHATEND

cat > .vercel/output/functions/chat.func/.vc-config.json << 'JSON'
{ "runtime": "nodejs22.x", "handler": "index.mjs", "launcherType": "Nodejs" }
JSON

cat > .vercel/output/config.json <<'JSON'
{ "version": 3, "routes": [
  { "src": "/api/webhook", "dest": "/webhook" },
  { "src": "/api/checkout", "dest": "/checkout" },
  { "src": "/api/session", "dest": "/checkout" },
  { "src": "/api/tier", "dest": "/checkout" },
  { "src": "/api/sync-subscription", "dest": "/webhook" },
  { "src": "/api/referral", "dest": "/referral" },
  { "src": "/api/referral-click", "dest": "/referral" },
  { "src": "/api/referral-conversion", "dest": "/referral" },
  { "src": "/api/chat", "dest": "/chat" },
  { "src": "^/(?!referrals$|support$|privacy$|terms-of-service$|pricing$|about$)([A-Za-z0-9][A-Za-z0-9-]{1,18}[A-Za-z0-9])$", "dest": "/redirect?code=$1" },
  { "handle": "filesystem" },
  { "src": "/(.*)", "dest": "/render" }
] }
JSON

echo "[4/4] inject runtime env vars into function configs"
bun --cjs -e '
  const { readFileSync, existsSync, writeFileSync, readdirSync } = require("fs");
  const { join } = require("path");

  // Read .env file
  const envContent = readFileSync(".env", "utf-8");
  const env = {};
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      const key = trimmed.substring(0, eq).trim();
      const value = trimmed.substring(eq + 1).trim();
      if (value) env[key] = value;
    }
  }

  // Inject into each function'\''s .vc-config.json
  const functionsDir = ".vercel/output/functions";
  for (const dir of readdirSync(functionsDir)) {
    const configPath = join(functionsDir, dir, ".vc-config.json");
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      config.environment = { ...(config.environment || {}), ...env };
      writeFileSync(configPath, JSON.stringify(config));
      console.log("  injected env vars into", configPath);
    }
  }
'

echo "done -> .vercel/output ready for: bunx vercel deploy --prebuilt"
