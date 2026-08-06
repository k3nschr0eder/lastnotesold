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
      const item = sub.items?.data?.[0];
      
      // Resolve product name: may be expanded (object) or just an ID (string)
      let productName = "";
      if (item?.price?.product) {
        if (typeof item.price.product === "string") {
          // Product not expanded — fetch it
          try {
            const key = process.env.STRIPE_SECRET_KEY || "";
            const prodRes = await fetch(`https://api.stripe.com/v1/products/${item.price.product}`, {
              headers: { "Authorization": "Basic " + Buffer.from(key + ":").toString("base64") },
            });
            const prod = await prodRes.json();
            productName = prod.name || "";
          } catch(e) {
            console.error("[Webhook] Product lookup failed:", e);
          }
        } else {
          productName = item.price.product.name || "";
        }
      }
      
      // Only process LastNoteSold subscriptions — skip LastSoldCoin ones
      if (!productName.toLowerCase().includes("lastnotesold")) {
        console.log("[Webhook] Skipping non-LastNoteSold subscription:", productName);
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ received: true, skipped: true }));
        return;
      }
      
      const PREMIER_PRICES = ["price_1TwOtyExpuSFJTtEmSxDgmmp"];
      const PRO_PRICES = ["price_1TwOtrExpuSFJTtEH7NTOh0O"];
      const priceId = item?.price?.id;
      let tier = "pro";
      if (PREMIER_PRICES.includes(priceId)) tier = "premier";
      else if (PRO_PRICES.includes(priceId)) tier = "pro";
      
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
          body: JSON.stringify({ code: referralCode, bountyAmountCents: tier === "premier" ? 500 : 200 }),
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

      if (!sub) {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ tier: "free" }));
        return;
      }

      const item = sub.items?.data?.[0];
      const priceId = item?.price?.id;
      const PREMIER_PRICES = ["price_1TwOtyExpuSFJTtEmSxDgmmp"];
      const PRO_PRICES = ["price_1TwOtrExpuSFJTtEH7NTOh0O"];
      let tier;
      if (PREMIER_PRICES.includes(priceId)) {
        tier = "premier";
      } else if (PRO_PRICES.includes(priceId)) {
        tier = "pro";
      } else {
        // Price ID not recognized — fetch product name separately to check brand
        const productId = item?.price?.product;
        if (productId && typeof productId === "string") {
          try {
            const prodRes = await fetch(`https://api.stripe.com/v1/products/${productId}`, {
              headers: { "Authorization": "Basic " + Buffer.from(key + ":").toString("base64") },
            });
            const prod = await prodRes.json();
            const productName = (prod.name || "").toLowerCase();
            tier = productName.includes("lastnotesold") ? "pro" : "free";
          } catch(e) {
            tier = "free";
          }
        } else {
          tier = "free";
        }
      }
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
      params.delete("allow_promotion_codes");
      params.set("metadata[referral_code]", referralCode);
      params.set("discounts[0][coupon]", "9HS0tgBV");
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
      res.end(JSON.stringify({ reply: "Chat support is coming soon! In the meantime, check our FAQ below or email support@lastnotesold.com." }));
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
          { role: "system", content: "You are a helpful support assistant for LastNoteSold, a real-time paper money pricing tool for live streamers on Whatnot, TikTok Live, and eBay Live. LastNoteSold pulls live pricing data from eBay Active listings, Greensheet/CPG dealer pricing, and Sold-Comps. Plans: Free (10 lookups/day, eBay only, 3 comps), Pro ($14.99/mo, + Greensheet CPG, 20 comps), Premier ($24.99/mo, + Sold-Comps, 20 comps). Keep answers concise and friendly." },
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

# ── Stream Events handler (SSE + poll for OBS overlay event delivery) ──
mkdir -p .vercel/output/functions/stream-events.func
cat > .vercel/output/functions/stream-events.func/index.mjs << 'STREAMEVEOF'
const TU = (process.env.TEAM_DB_URL || "").replace("libsql://", "https://");
const TT = process.env.TEAM_DB_AUTH_TOKEN || "";

const tursoFetch = async (sql, args = []) => {
  const r = await fetch(TU + "/v2/pipeline", {
    method: "POST",
    headers: { "Authorization": "Bearer " + TT, "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [
      { type: "execute", stmt: { sql, args: args.map(v => ({ type: "text", value: String(v) })) } },
      { type: "close" }
    ]}),
    signal: AbortSignal.timeout(8000),
  });
  const j = await r.json();
  if (j.results) { for (const res of j.results) { if (res.type === "error") throw new Error("Turso pipeline error: " + JSON.stringify(res)); } }
  return j;
};

const tursoQuery = async (sql, args = []) => {
  const j = await tursoFetch(sql, args);
  const result = j.results?.[0]?.response?.result;
  if (!result) return [];
  const cols = (result.cols || []).map(c => typeof c === "string" ? c : c.name || "");
  return (result.rows || []).map(row => {
    const obj = {};
    cols.forEach((col, i) => { obj[col] = row[i]?.value != null ? row[i].value : row[i]; });
    return obj;
  });
};

const tursoExec = async (sql, args = []) => { await tursoFetch(sql, args); };

let overlaysEnsured = false;
async function ensureOverlaysTable() {
  if (overlaysEnsured) return;
  try { await tursoExec("CREATE TABLE IF NOT EXISTS overlays (id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, customer_id TEXT, query TEXT, name TEXT DEFAULT '', config TEXT DEFAULT '{}', is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))"); } catch (_) {}
  try { await tursoExec("CREATE INDEX IF NOT EXISTS idx_overlays_token ON overlays(token)"); } catch (_) {}
  try { await tursoExec("CREATE INDEX IF NOT EXISTS idx_overlays_customer ON overlays(customer_id)"); } catch (_) {}
  overlaysEnsured = true;
}

async function getOverlayByToken(token) {
  const rows = await tursoQuery(
    "SELECT id, token, customer_id, query FROM overlays WHERE token = ? LIMIT 1",
    [token],
  );
  return rows[0] || null;
}

let eventsEnsured = false;
async function ensureEventsTable() {
  if (eventsEnsured) return;
  try { await tursoExec("CREATE TABLE IF NOT EXISTS overlay_events (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')))"); } catch (_) {}
  try { await tursoExec("CREATE INDEX IF NOT EXISTS idx_oe_token_created ON overlay_events(token, created_at)"); } catch (_) {}
  eventsEnsured = true;
}

async function pollEvents(token, sinceId) {
  const rows = await tursoQuery(
    "SELECT id, token, event_type, payload, created_at FROM overlay_events WHERE token = ? AND id > ? ORDER BY id ASC LIMIT 50",
    [token, String(sinceId)],
  );
  const events = rows.map(r => ({
    id: r.id,
    token: r.token,
    event_type: r.event_type,
    payload: typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload,
    created_at: r.created_at,
  }));
  return {
    events,
    latestId: events.length > 0 ? events[events.length - 1].id : sinceId,
  };
}

async function cleanupOldEvents() {
  await tursoExec("DELETE FROM overlay_events WHERE created_at < datetime('now', '-5 minutes')");
}

async function getLatestEventId(token) {
  const rows = await tursoQuery(
    "SELECT id FROM overlay_events WHERE token = ? ORDER BY id DESC LIMIT 1",
    [token],
  );
  return Number(rows[0]?.id) || 0;
}

async function publishEvent(token, eventType, payload) {
  await tursoExec(
    "INSERT INTO overlay_events (token, event_type, payload) VALUES (?, ?, ?)",
    [token, eventType, JSON.stringify(payload)],
  );
}

export default async function handler(req, res) {
  const url = new URL(req.url || "", "http://localhost");
  const method = (req.method || "GET").toUpperCase();

  // POST: Publish event (panel pushes results here)
  if (method === "POST") {
    let body = "";
    try {
      body = await new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", c => chunks.push(c));
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        req.on("error", reject);
      });
    } catch {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Failed to read body" }));
      return;
    }

    let data;
    try { data = JSON.parse(body); } catch {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    const token = (data.token || "").trim();
    if (!token) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Missing token" }));
      return;
    }

    await ensureOverlaysTable();
    const overlay = await getOverlayByToken(token);
    if (!overlay) {
      res.statusCode = 401;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Invalid or inactive overlay token" }));
      return;
    }

    await ensureEventsTable();
    await publishEvent(token, data.event_type || "result", data.payload || {});

    if (data.payload && typeof data.payload === "object" && data.payload.query) {
      try {
        await tursoExec("UPDATE overlays SET query = ? WHERE token = ?",
          [String(data.payload.query), token]);
      } catch {}
    }

    cleanupOldEvents().catch(() => {});
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // GET: SSE streaming or poll
  const token = url.searchParams.get("token");
  const lastEventId = parseInt(req.headers["last-event-id"] || "0", 10) || 0;

  if (!token) {
    res.statusCode = 400;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Missing token parameter" }));
    return;
  }

  await ensureOverlaysTable();

  let overlay = null;
  try { overlay = await getOverlayByToken(token); } catch {}

  if (!overlay) {
    res.statusCode = 401;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Invalid or inactive overlay token" }));
    return;
  }

  // Poll mode
  if (url.searchParams.get("poll") === "1") {
    try {
      await ensureEventsTable();
      const after = parseInt(url.searchParams.get("after") || "0", 10) || 0;
      const result = await pollEvents(token, after);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.end(JSON.stringify({ events: result.events, latestId: result.latestId }));
    } catch (e) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Poll failed", detail: String(e?.message || e).substring(0, 120) }));
    }
    return;
  }

  // SSE streaming
  await ensureEventsTable();

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  let latestId = lastEventId > 0 ? lastEventId : await getLatestEventId(token);
  const config = { query: overlay.query || "" };
  res.write("id: " + latestId + "\nevent: connected\ndata: " + JSON.stringify({ status: "connected", token, latestId, config }) + "\n\n");

  cleanupOldEvents().catch(() => {});

  let pollCount = 0;
  const MAX_POLLS = 600;
  let aborted = false;

  req.on("close", () => { aborted = true; });

  const poll = async () => {
    if (aborted) return;
    try {
      const result = await pollEvents(token, latestId);
      if (result.events.length > 0) {
        for (const evt of result.events) {
          res.write("id: " + evt.id + "\nevent: " + evt.event_type + "\ndata: " + JSON.stringify(evt.payload) + "\n\n");
        }
        latestId = result.latestId;
      }
      pollCount++;
      if (pollCount % 60 === 0) { cleanupOldEvents().catch(() => {}); }
      if (pollCount < MAX_POLLS && !aborted) {
        setTimeout(poll, 500);
      } else if (!aborted) {
        res.write("id: " + latestId + "\nevent: done\ndata: " + JSON.stringify({ reason: "timeout", latestId }) + "\n\n");
        res.end();
      }
    } catch {
      res.write("event: error\ndata: " + JSON.stringify({ message: "Stream error" }) + "\n\n");
      pollCount++;
      if (pollCount < MAX_POLLS && !aborted) { setTimeout(poll, 2000); }
      else { res.end(); }
    }
  };
  poll();
}
STREAMEVEOF

cat > .vercel/output/functions/stream-events.func/.vc-config.json << 'JSON'
{ "runtime": "nodejs22.x", "handler": "index.mjs", "launcherType": "Nodejs" }
JSON

# Create admin API function
mkdir -p .vercel/output/functions/admin.func
cat > .vercel/output/functions/admin.func/index.mjs << 'ADMINEND'
import { createHmac, timingSafeEqual } from "node:crypto";

function getSigningSecret() {
  return process.env.ADMIN_SECRET || process.env.STRIPE_SECRET_KEY || "dev-fallback-secret";
}

function sign(value) {
  const hmac = createHmac("sha256", getSigningSecret());
  hmac.update(value);
  return value + "." + hmac.digest("hex");
}

function verifyCookie(signed) {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot < 0) return null;
  const value = signed.substring(0, lastDot);
  const expected = sign(value);
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signed);
    if (a.length !== b.length) return null;
    return timingSafeEqual(a, b) ? value : null;
  } catch {
    return null;
  }
}

function getCookies(req) {
  const cookieHeader = req.headers.cookie || "";
  const cookies = {};
  cookieHeader.split(";").forEach(function(pair) {
    var eq = pair.indexOf("=");
    if (eq > 0) {
      cookies[pair.substring(0, eq).trim()] = pair.substring(eq + 1).trim();
    }
  });
  return cookies;
}

function checkAdminSession(req) {
  var cookies = getCookies(req);
  var cookie = cookies["lns_admin"];
  if (!cookie) return null;
  var email = verifyCookie(cookie);
  if (!email) return null;
  var admins = (process.env.ADMIN_EMAILS || "").split(",").map(function(s) { return s.trim().toLowerCase(); }).filter(Boolean);
  var superadmins = (process.env.SUPERADMIN_EMAILS || "").split(",").map(function(s) { return s.trim().toLowerCase(); }).filter(Boolean);
  if (!admins.includes(email)) return null;
  return { email: email, isSuperadmin: superadmins.includes(email) };
}

function getTursoConfig() {
  var dbUrl = process.env.TEAM_DB_URL;
  var token = process.env.TEAM_DB_AUTH_TOKEN;
  if (!dbUrl || !token) return null;
  return { url: dbUrl.replace("libsql://", "https://"), token: token };
}

async function runQuery(sql, params) {
  var cfg = getTursoConfig();
  if (!cfg) return [];
  params = params || [];
  try {
    var ctrl = new AbortController();
    var timer = setTimeout(function() { ctrl.abort(); }, 8000);
    var r = await fetch(cfg.url + "/v2/pipeline", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + cfg.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          { type: "execute", stmt: { sql: sql, args: params.map(function(v) { return { type: "text", value: String(v) }; }) } },
          { type: "close" },
        ],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    var j = await r.json();
    var results = j.results?.[0]?.response?.result;
    var rows = results?.rows || [];
    var cols = (results?.cols || []).map(function(c) { return c.name; });
    return rows.map(function(row) {
      var obj = {};
      if (Array.isArray(row) && cols.length > 0) {
        row.forEach(function(cell, i) { obj[cols[i]] = cell?.value; });
      } else if (row.columns) {
        row.columns.forEach(function(c) { obj[c.name] = c.value; });
      } else {
        Object.keys(row).forEach(function(k) { obj[k] = row[k]?.value != null ? row[k].value : row[k]; });
      }
      return obj;
    });
  } catch (e) { return []; }
}

async function getBody(req) {
  return new Promise(function(resolve, reject) {
    var chunks = [];
    req.on("data", function(chunk) { chunks.push(chunk); });
    req.on("end", function() { resolve(Buffer.concat(chunks).toString("utf-8")); });
    req.on("error", reject);
  });
}

var PREMIER_PRICES_ADMIN = ["price_1TwOtyExpuSFJTtEmSxDgmmp"];
var PRO_PRICES_ADMIN = ["price_1TwOtrExpuSFJTtEH7NTOh0O"];
var LNS_PRICE_IDS_ADMIN = PREMIER_PRICES_ADMIN.concat(PRO_PRICES_ADMIN);

async function handleSubscriptions(auth) {
  var allSubs = [];
  var statuses = ["active", "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired"];
  for (var si = 0; si < statuses.length; si++) {
    var status = statuses[si];
    var hasMore = true;
    var startingAfter;
    while (hasMore) {
      var url = "https://api.stripe.com/v1/subscriptions?status=" + status + "&limit=100" +
        (startingAfter ? "&starting_after=" + startingAfter : "");
      var res = await fetch(url, { headers: { Authorization: auth } });
      var data = await res.json();
      allSubs.push.apply(allSubs, data.data || []);
      hasMore = data.has_more;
      startingAfter = data.data?.length ? data.data[data.data.length - 1].id : undefined;
    }
  }

  var customerCache = new Map();
  var customers = [];

  for (var i = 0; i < allSubs.length; i++) {
    var sub = allSubs[i];
    var customerId = sub.customer;
    var email = customerCache.get(customerId) || "";
    if (!email) {
      try {
        var cRes = await fetch("https://api.stripe.com/v1/customers/" + customerId, {
          headers: { Authorization: auth },
        });
        var cData = await cRes.json();
        email = cData.email || customerId;
        customerCache.set(customerId, email);
      } catch (e2) {
        email = customerId;
      }
    }

    var item = sub.items?.data?.[0];
    var listUnitAmount = (item?.price?.unit_amount || item?.plan?.amount || 0) / 100;
    var quantity = item?.quantity || 1;
    var listAmount = listUnitAmount * quantity;
    var priceId = item?.price?.id || "";
    var tier = (priceId.includes("TwOty") || priceId.includes("TwCvM")) ? "premier" : "pro";

    var effectiveAmount = listAmount;
    var discount = null;
    if (sub.latest_invoice) {
      try {
        var invRes = await fetch(
          "https://api.stripe.com/v1/invoices/" + sub.latest_invoice,
          { headers: { Authorization: auth } },
        );
        var inv = await invRes.json();
        effectiveAmount = (inv.amount_paid || inv.total || 0) / 100;
        if (effectiveAmount < listAmount) {
          discount = Math.round((listAmount - effectiveAmount) * 100) / 100;
        }
      } catch (e3) { /* ignore */ }
    }

    if (item && LNS_PRICE_IDS_ADMIN.includes(item.price?.id)) {
      customers.push({
        customerId: customerId,
        email: email,
        tier: tier,
        listAmount: Math.round(listAmount * 100) / 100,
        effectiveAmount: Math.round(effectiveAmount * 100) / 100,
        discount: discount,
        status: sub.status,
      });
    }
  }

  return { customers: customers };
}

async function handleSubscriptionsKpi(auth) {
  var activeSubs = [];
  var hasMore = true;
  var startingAfter;

  while (hasMore) {
    var url = "https://api.stripe.com/v1/subscriptions?status=active&limit=100" +
      (startingAfter ? "&starting_after=" + startingAfter : "");
    var res = await fetch(url, { headers: { Authorization: auth } });
    var data = await res.json();
    activeSubs.push.apply(activeSubs, data.data || []);
    hasMore = data.has_more;
    startingAfter = data.data?.length ? data.data[data.data.length - 1].id : undefined;
  }

  var listMrr = 0;
  var effectiveMrr = 0;
  for (var i = 0; i < activeSubs.length; i++) {
    var sub = activeSubs[i];
    var item = sub.items?.data?.[0];
    if (item && LNS_PRICE_IDS_ADMIN.includes(item.price?.id)) {
      var unitAmount = item?.price?.unit_amount || item?.plan?.amount || 0;
      var quantity = item?.quantity || 1;
      listMrr += (unitAmount / 100) * quantity;

      if (sub.latest_invoice) {
        try {
          var invRes = await fetch(
            "https://api.stripe.com/v1/invoices/" + sub.latest_invoice,
            { headers: { Authorization: auth } },
          );
          var inv = await invRes.json();
          effectiveMrr += (inv.amount_paid || inv.total || 0) / 100;
        } catch (e2) {
          effectiveMrr += (unitAmount / 100) * quantity;
        }
      } else {
        effectiveMrr += (unitAmount / 100) * quantity;
      }
    }
  }

  var thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 86400;
  var canceledCount = 0;
  hasMore = true;
  startingAfter = undefined;

  while (hasMore) {
    var url2 = "https://api.stripe.com/v1/subscriptions?status=canceled&limit=100" +
      (startingAfter ? "&starting_after=" + startingAfter : "");
    var res2 = await fetch(url2, { headers: { Authorization: auth } });
    var data2 = await res2.json();
    for (var j = 0; j < (data2.data || []).length; j++) {
      var sub2 = data2.data[j];
      var item2 = sub2.items?.data?.[0];
      if (item2 && LNS_PRICE_IDS_ADMIN.includes(item2.price?.id) && sub2.canceled_at && sub2.canceled_at >= thirtyDaysAgo) canceledCount++;
    }
    hasMore = data2.has_more;
    startingAfter = data2.data?.length ? data2.data[data2.data.length - 1].id : undefined;
  }

  var totalActive = activeSubs.length;
  var churnRate = totalActive > 0 ? canceledCount / totalActive : 0;

  return {
    listMrr: Math.round(listMrr * 100) / 100,
    effectiveMrr: Math.round(effectiveMrr * 100) / 100,
    activeSubscribers: totalActive,
    churnRate: Math.round(churnRate * 10000) / 100,
  };
}

async function handleCoupons(auth) {
  var allCoupons = [];
  var hasMore = true;
  var startingAfter;
  while (hasMore) {
    var url = "https://api.stripe.com/v1/coupons?limit=100" +
      (startingAfter ? "&starting_after=" + startingAfter : "");
    var res = await fetch(url, { headers: { Authorization: auth } });
    var data = await res.json();
    allCoupons.push.apply(allCoupons, data.data || []);
    hasMore = data.has_more;
    startingAfter = data.data?.length ? data.data[data.data.length - 1].id : undefined;
  }

  var allPromoCodes = [];
  hasMore = true;
  startingAfter = undefined;
  while (hasMore) {
    var url2 = "https://api.stripe.com/v1/promotion_codes?limit=100" +
      (startingAfter ? "&starting_after=" + startingAfter : "");
    var res2 = await fetch(url2, { headers: { Authorization: auth } });
    var data2 = await res2.json();
    allPromoCodes.push.apply(allPromoCodes, data2.data || []);
    hasMore = data2.has_more;
    startingAfter = data2.data?.length ? data2.data[data2.data.length - 1].id : undefined;
  }

  var coupons = allCoupons.map(function(c) {
    return {
      id: c.id,
      code: c.name || c.id,
      discountType: c.amount_off ? "fixed" : c.percent_off ? "percent" : "unknown",
      amount: c.amount_off ? c.amount_off / 100 : c.percent_off || 0,
      currency: c.currency || "",
      duration: c.duration,
      durationInMonths: c.duration_in_months || null,
      timesRedeemed: c.times_redeemed || 0,
      maxRedemptions: c.max_redemptions || null,
      validUntil: c.redeem_by ? new Date(c.redeem_by * 1000).toISOString() : null,
      active: c.valid,
      isPromotionCode: false,
    };
  });

  for (var i = 0; i < allPromoCodes.length; i++) {
    var pc = allPromoCodes[i];
    var c = pc.coupon;
    coupons.push({
      id: pc.id,
      code: pc.code,
      discountType: c.amount_off ? "fixed" : c.percent_off ? "percent" : "unknown",
      amount: c.amount_off ? c.amount_off / 100 : c.percent_off || 0,
      currency: c.currency || "",
      duration: c.duration,
      durationInMonths: c.duration_in_months || null,
      timesRedeemed: c.times_redeemed || 0,
      maxRedemptions: pc.max_redemptions || c.max_redemptions || null,
      validUntil: pc.expires_at ? new Date(pc.expires_at * 1000).toISOString() : null,
      active: pc.active,
      isPromotionCode: true,
    });
  }

  return { coupons: coupons };
}

async function handleReferrals() {
  var totalRef = await runQuery("SELECT COUNT(*) as c FROM referrals");
  var totalReferrals = Number(totalRef[0]?.c || 0);
  var totalClick = await runQuery("SELECT COUNT(*) as c FROM referral_clicks");
  var totalClicks = Number(totalClick[0]?.c || 0);
  var totalConv = await runQuery("SELECT COUNT(*) as c, COALESCE(SUM(bounty_amount_cents), 0) as total FROM referral_conversions");
  var totalConversions = Number(totalConv[0]?.c || 0);
  var totalBounties = Number(totalConv[0]?.total || 0);

  var topRef = await runQuery(
    "SELECT r.code, " +
    "(SELECT COUNT(*) FROM referral_clicks c WHERE c.code = r.code) as clicks, " +
    "(SELECT COUNT(*) FROM referral_conversions v WHERE v.code = r.code) as conversions, " +
    "(SELECT COALESCE(SUM(v2.bounty_amount_cents), 0) FROM referral_conversions v2 WHERE v2.code = r.code) as bounties " +
    "FROM referrals r ORDER BY conversions DESC LIMIT 20"
  );

  var topReferrers = topRef.map(function(r) {
    return {
      code: r.code || "",
      clicks: Number(r.clicks || 0),
      conversions: Number(r.conversions || 0),
      bountiesEarned: Number(r.bounties || 0),
    };
  });

  var conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;

  return {
    totalReferrals: totalReferrals,
    totalClicks: totalClicks,
    totalConversions: totalConversions,
    conversionRate: Math.round(conversionRate * 100) / 100,
    totalBounties: totalBounties,
    topReferrers: topReferrers,
  };
}

function json(res, code, body) {
  res.statusCode = code;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  var url = req.url || "";

  // POST /api/admin/login
  if (url.includes("/api/admin/login") && req.method === "POST") {
    try {
      var body = await getBody(req);
      var data = JSON.parse(body || "{}");
      var email = (data.email || "").trim().toLowerCase();
      var password = (data.password || "").trim();

      if (!email || !password) {
        return json(res, 401, { error: "Email and password required" });
      }

      var admins = (process.env.ADMIN_EMAILS || "")
        .split(",").map(function(s) { return s.trim().toLowerCase(); }).filter(Boolean);

      if (!admins.includes(email)) {
        return json(res, 401, { error: "Not authorized" });
      }

      var adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminPassword || password !== adminPassword) {
        return json(res, 401, { error: "Invalid credentials" });
      }

      var superadmins = (process.env.SUPERADMIN_EMAILS || "")
        .split(",").map(function(s) { return s.trim().toLowerCase(); }).filter(Boolean);

      var signed = sign(email);
      res.setHeader("Set-Cookie",
        "lns_admin=" + signed + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400");
      return json(res, 200, { success: true, email: email, isSuperadmin: superadmins.includes(email) });
    } catch (e) {
      console.error("[Admin] Login error:", e);
      return json(res, 500, { error: "Internal server error" });
    }
  }

  // GET /api/admin/session
  if (url.includes("/api/admin/session") && req.method === "GET") {
    var session = checkAdminSession(req);
    if (!session) {
      return json(res, 401, { error: "Not authenticated" });
    }
    return json(res, 200, { email: session.email, isSuperadmin: session.isSuperadmin });
  }

  // POST /api/admin/logout
  if (url.includes("/api/admin/logout") && req.method === "POST") {
    res.setHeader("Set-Cookie",
      "lns_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    return json(res, 200, { success: true });
  }

  // All remaining routes require admin session
  if (!checkAdminSession(req)) {
    return json(res, 401, { error: "Not authenticated" });
  }

  var key = process.env.STRIPE_SECRET_KEY || "";
  var auth = "Basic " + Buffer.from(key + ":").toString("base64");

  // GET /api/admin/subscriptions-kpi
  if (url.includes("/api/admin/subscriptions-kpi") && req.method === "GET") {
    try {
      var kpi = await handleSubscriptionsKpi(auth);
      return json(res, 200, kpi);
    } catch (e) {
      console.error("[Admin] Subscriptions KPI error:", e);
      return json(res, 200, { listMrr: 0, effectiveMrr: 0, activeSubscribers: 0, churnRate: 0 });
    }
  }

  // GET /api/admin/subscriptions
  if (url.includes("/api/admin/subscriptions") && req.method === "GET") {
    try {
      var subData = await handleSubscriptions(auth);
      return json(res, 200, subData);
    } catch (e) {
      console.error("[Admin] Subscriptions error:", e);
      return json(res, 200, { customers: [], error: String(e) });
    }
  }

  // GET /api/admin/coupons
  if (url.includes("/api/admin/coupons") && req.method === "GET") {
    try {
      var couponData = await handleCoupons(auth);
      return json(res, 200, couponData);
    } catch (e) {
      console.error("[Admin] Coupons error:", e);
      return json(res, 200, { coupons: [], error: String(e) });
    }
  }

  // GET /api/admin/referrals
  if (url.includes("/api/admin/referrals") && req.method === "GET") {
    try {
      var refData = await handleReferrals();
      return json(res, 200, refData);
    } catch (e) {
      console.error("[Admin] Referrals error:", e);
      return json(res, 200, { totalReferrals: 0, totalClicks: 0, totalConversions: 0, conversionRate: 0, totalBounties: 0, topReferrers: [] });
    }
  }

  // 404 for unmatched admin routes
  return json(res, 404, { error: "Not found" });
}
ADMINEND

cat > .vercel/output/functions/admin.func/.vc-config.json << 'JSON'
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
  { "src": "/api/referral-delete", "dest": "/referral" },
  { "src": "/api/chat", "dest": "/chat" },
  { "src": "/api/stream/events", "dest": "/stream-events" },
  { "src": "/api/admin/(.*)", "dest": "/admin" },
  { "src": "^/(?!referrals$|support$|privacy$|terms-of-service$|pricing$|about$|blog$|dashboard$|overlays$|admin$)([A-Za-z0-9][A-Za-z0-9-]{1,18}[A-Za-z0-9])$", "dest": "/redirect?code=$1" },
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
