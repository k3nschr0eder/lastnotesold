// Self-contained referral API — uses Turso HTTP API, no external deps
// Handles:
//   GET  /api/referral?customerId=...&stats=true   — get ALL codes + per-code stats
//   GET  /api/referral?customerId=...              — get all codes (auto-creates first for Pro/Premier)
//   GET  /api/referral?lookup=CODE                 — resolve a short code (for redirect.func)
//   POST /api/referral                             — set/rename custom code (body: { customerId, code, oldCode? })
//   POST /api/referral-delete                      — delete a code with zero conversions (body: { customerId, code })
//   POST /api/referral-click                       — record a click (body: { code })
//   POST /api/referral-conversion                  — record a conversion (body: { code, stripeCustomerId, bountyAmountCents })
//
// Tier rules (owner-confirmed 2026-08-05):
//   Pro     — 1 referral code, 20 conversions/month per code
//   Premier — up to 3 referral codes, 20 conversions/month per code
//   Code deletion allowed only when the code has zero conversions.

const PREMIER_PRICES = ["price_1TwOtyExpuSFJTtEmSxDgmmp"];
const PRO_PRICES = ["price_1TwOtrExpuSFJTtEH7NTOh0O"];
const MONTHLY_CONVERSION_LIMIT = 20;

export default async function handler(req, res) {
  const url = req.url || "";

  const TURSO_URL = (process.env.TEAM_DB_URL || "").replace("libsql://", "https://");
  const TURSO_TOKEN = process.env.TEAM_DB_AUTH_TOKEN || "";

  const runQuery = async (sql, params = []) => {
    if (!TURSO_URL || !TURSO_TOKEN) return [];
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(TURSO_URL + "/v2/pipeline", {
        method: "POST",
        headers: { "Authorization": "Bearer " + TURSO_TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            { type: "execute", stmt: { sql, args: params.map(v => ({ type: "text", value: String(v) })) } },
            { type: "close" },
          ],
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const j = await r.json();
      const results = j.results?.[0]?.response?.result;
      const rows = results?.rows || [];
      const cols = (results?.cols || []).map(c => c.name);
      return rows.map(row => {
        const obj = {};
        if (Array.isArray(row) && cols.length > 0) {
          // Turso v2 pipeline: rows are arrays of {type, value}, map by cols
          row.forEach((cell, i) => { obj[cols[i]] = cell?.value; });
        } else if (row.columns) {
          row.columns.forEach(c => { obj[c.name] = c.value; });
        } else {
          Object.keys(row).forEach(k => {
            obj[k] = row[k]?.value != null ? row[k].value : row[k];
          });
        }
        return obj;
      });
    } catch (e) {
      console.error("Turso query error:", String(e.message || e).substring(0, 200));
      return [];
    }
  };

  const runExec = async (sql, params = []) => {
    if (!TURSO_URL || !TURSO_TOKEN) return { success: false };
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      await fetch(TURSO_URL + "/v2/pipeline", {
        method: "POST",
        headers: { "Authorization": "Bearer " + TURSO_TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            { type: "execute", stmt: { sql, args: params.map(v => ({ type: "text", value: String(v) })) } },
            { type: "close" },
          ],
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      return { success: true };
    } catch (e) {
      console.error("Turso exec error:", String(e.message || e).substring(0, 200));
      return { success: false };
    }
  };

  const hasDB = !!(TURSO_URL && TURSO_TOKEN);

  // Read body helper
  const readBody = () => new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });

  // ================================================================
  // Helpers
  // ================================================================

  const codeLimitForTier = (tier) => {
    if (tier === "premier") return 3;
    if (tier === "pro") return 1;
    return 0;
  };

  const linkForCode = (code) => "https://www.lastnotesold.com/" + code;

  const isValidCode = (code) => /^[A-Z0-9][A-Z0-9-]{1,18}[A-Z0-9]$/.test(code);

  /**
   * Determine the customer's subscription tier via the Stripe API.
   * Price ID matching first (most reliable), product-name fallback for brand check.
   * Returns "free" when no active subscription or lookup fails (fail-closed for
   * code creation; existing codes are always returned regardless of tier).
   */
  const getCustomerTier = async (customerId) => {
    const key = process.env.STRIPE_SECRET_KEY || "";
    if (!key) {
      console.error("[Referral] STRIPE_SECRET_KEY is not set — tier enforcement will fail closed");
      return "free";
    }
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(
        "https://api.stripe.com/v1/subscriptions?customer=" + encodeURIComponent(customerId) + "&status=active&limit=1",
        { headers: { "Authorization": "Basic " + Buffer.from(key + ":").toString("base64") }, signal: ctrl.signal }
      );
      clearTimeout(timer);
      const data = await r.json();
      const sub = data.data?.[0];
      if (!sub) return "free";

      const item = sub.items?.data?.[0];
      const priceId = item?.price?.id;
      if (PREMIER_PRICES.includes(priceId)) return "premier";
      if (PRO_PRICES.includes(priceId)) return "pro";

      // Price ID not recognized — check the product name for brand
      const productId = item?.price?.product;
      if (productId && typeof productId === "string") {
        try {
          const prodRes = await fetch("https://api.stripe.com/v1/products/" + productId, {
            headers: { "Authorization": "Basic " + Buffer.from(key + ":").toString("base64") },
            signal: AbortSignal.timeout(5000),
          });
          const prod = await prodRes.json();
          const productName = (prod.name || "").toLowerCase();
          if (productName.includes("lastnotesold")) return "pro";
        } catch (e) {
          console.error("[Referral] Stripe product lookup failed:", String(e.message || e).substring(0, 120));
        }
      }
      return "free";
    } catch (e) {
      console.error("[Referral] Tier lookup failed:", String(e.message || e).substring(0, 120));
      return "free";
    }
  };

  const getCustomerCodes = async (customerId) =>
    runQuery("SELECT code FROM referrals WHERE customer_id = ? ORDER BY id ASC", [customerId]);

  const generateCode = () =>
    "LNS-" + Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();

  /** Ensure the customer has at least one code if they're an eligible subscriber. Returns codes. */
  const ensureCode = async (customerId, tier) => {
    const codeLimit = codeLimitForTier(tier);
    const rows = await getCustomerCodes(customerId);
    if (rows.length === 0 && codeLimit > 0) {
      const gen = generateCode();
      await runExec("INSERT OR IGNORE INTO referrals (code, customer_id) VALUES (?, ?)", [gen, customerId]);
      return [{ code: gen }];
    }
    return rows;
  };

  /** Per-code stats from the referral_clicks / referral_conversions tables. */
  const buildCodeStats = async (code) => {
    const clicks = await runQuery("SELECT COUNT(*) as c FROM referral_clicks WHERE code = ?", [code]);
    const conversions = await runQuery(
      "SELECT COUNT(*) as c, COALESCE(SUM(bounty_amount_cents), 0) as total FROM referral_conversions WHERE code = ?",
      [code]
    );
    const monthConversions = await runQuery(
      "SELECT COUNT(*) as c FROM referral_conversions WHERE code = ? AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')",
      [code]
    );
    const clickCount = Number(clicks[0]?.c || clicks[0]?.["c"] || 0);
    const convCount = Number(conversions[0]?.c || conversions[0]?.["c"] || 0);
    const totalCents = Number(conversions[0]?.total || conversions[0]?.["total"] || 0);
    const monthlyConvCount = Number(monthConversions[0]?.c || monthConversions[0]?.["c"] || 0);
    return {
      code,
      clicks: clickCount,
      conversions: convCount,
      bountyEarnedCents: totalCents,
      bountyEarnedDollars: (totalCents / 100).toFixed(2),
      monthlyConversions: monthlyConvCount,
      monthlyLimit: MONTHLY_CONVERSION_LIMIT,
      remainingThisMonth: Math.max(0, MONTHLY_CONVERSION_LIMIT - monthlyConvCount),
    };
  };

  // ================================================================
  // POST /api/referral-click — record a click
  // ================================================================
  if (url.includes("/api/referral-click") && req.method === "POST") {
    try {
      const body = await readBody();
      const { code } = JSON.parse(body || "{}");
      if (!code) {
        res.statusCode = 400;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "Missing code" }));
        return;
      }
      await runExec("INSERT INTO referral_clicks (code) VALUES (?)", [code]);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ recorded: true }));
    } catch (e) {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ recorded: false }));
    }
    return;
  }

  // ================================================================
  // POST /api/referral-conversion — record a conversion
  // Body: { code: "REFCODE", stripeCustomerId: "cus_...", bountyAmountCents: 500 }
  // Enforces 20 conversions per month per referral code
  // ================================================================
  if (url.includes("/api/referral-conversion") && req.method === "POST") {
    try {
      const body = await readBody();
      const { code, stripeCustomerId, bountyAmountCents } = JSON.parse(body || "{}");

      if (!code) {
        res.statusCode = 400;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "Missing code" }));
        return;
      }

      if (!hasDB) {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "Referral system initializing — check back soon." }));
        return;
      }

      // Count this month's conversions for the referrer's code
      const monthCount = await runQuery(
        "SELECT COUNT(*) as c FROM referral_conversions WHERE code = ? AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')",
        [code]
      );
      const monthlyConversions = Number(monthCount[0]?.c || monthCount[0]?.["c"] || 0);

      if (monthlyConversions >= MONTHLY_CONVERSION_LIMIT) {
        res.statusCode = 429;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          error: `Monthly referral limit reached (${MONTHLY_CONVERSION_LIMIT}/${MONTHLY_CONVERSION_LIMIT}). New conversions will count next month.`,
          monthlyConversions,
          monthlyLimit: MONTHLY_CONVERSION_LIMIT,
        }));
        return;
      }

      const amount = Number(bountyAmountCents) || 500;
      // NOTE: live schema column is referred_customer_id (NOT stripe_customer_id) and it is
      // UNIQUE NOT NULL — use a unique fallback when the caller doesn't pass a Stripe customer.
      const referredId = (stripeCustomerId && String(stripeCustomerId).trim())
        ? String(stripeCustomerId).trim()
        : "anon-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 8);
      await runExec(
        "INSERT INTO referral_conversions (code, referred_customer_id, bounty_amount_cents, created_at) VALUES (?, ?, ?, datetime('now'))",
        [code, referredId, String(amount)]
      );

      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        recorded: true,
        monthlyConversions: monthlyConversions + 1,
        monthlyLimit: MONTHLY_CONVERSION_LIMIT,
        remainingThisMonth: MONTHLY_CONVERSION_LIMIT - (monthlyConversions + 1),
      }));
    } catch (e) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Internal error: " + String(e.message || e).substring(0, 100) }));
    }
    return;
  }

  // ================================================================
  // POST /api/referral-delete — delete a code (zero conversions only)
  // Body: { customerId: "cus_...", code: "MYCODE" }
  // ================================================================
  if (url.includes("/api/referral-delete") && req.method === "POST") {
    try {
      const body = await readBody();
      const { customerId, code } = JSON.parse(body || "{}");

      if (!customerId || !code) {
        res.statusCode = 400;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "Missing customerId or code" }));
        return;
      }

      if (!hasDB) {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "Referral system initializing — check back soon." }));
        return;
      }

      const trimmed = String(code).trim().toUpperCase();

      // Tier enforcement — only Pro/Premier subscribers manage codes
      const tier = await getCustomerTier(customerId);
      if (codeLimitForTier(tier) === 0) {
        res.statusCode = 403;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "Referral codes are only available for Pro and Premier subscribers." }));
        return;
      }

      // Verify the code belongs to this customer
      const owned = await runQuery(
        "SELECT code FROM referrals WHERE customer_id = ? AND code = ?",
        [customerId, trimmed]
      );
      if (owned.length === 0) {
        res.statusCode = 404;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "Referral code not found." }));
        return;
      }

      // Only allow deletion when the code has zero conversions
      const conv = await runQuery("SELECT COUNT(*) as c FROM referral_conversions WHERE code = ?", [trimmed]);
      const convCount = Number(conv[0]?.c || conv[0]?.["c"] || 0);
      if (convCount > 0) {
        res.statusCode = 400;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          error: "You can't delete a referral code that already has conversions.",
          conversions: convCount,
        }));
        return;
      }

      await runExec("DELETE FROM referrals WHERE customer_id = ? AND code = ?", [customerId, trimmed]);

      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ success: true, deleted: trimmed }));
    } catch (e) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Internal error: " + String(e.message || e).substring(0, 100) }));
    }
    return;
  }

  // ================================================================
  // POST /api/referral — set/rename custom code
  // Body: { customerId: "cus_...", code: "SNTCOIN", oldCode?: "PREVCODE" }
  //   - oldCode provided → rename that specific code (targeted UPDATE)
  //   - no oldCode       → INSERT a new code (after tier + COUNT cap check)
  // ================================================================
  if (url.includes("/api/referral") && req.method === "POST") {
    try {
      const body = await readBody();
      const { customerId, code, oldCode } = JSON.parse(body || "{}");

      if (!customerId || !code) {
        res.statusCode = 400;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "Missing customerId or code" }));
        return;
      }

      if (!hasDB) {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "Referral system initializing — check back soon." }));
        return;
      }

      // Validate code format: 3-20 chars, alphanumeric + hyphens only
      const trimmed = String(code).trim().toUpperCase();
      if (!isValidCode(trimmed)) {
        res.statusCode = 400;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          error: "Invalid code format. Use 3-20 letters, numbers, and hyphens (cannot start or end with hyphen).",
        }));
        return;
      }

      // Tier enforcement — Pro = 1 code, Premier = up to 3
      const tier = await getCustomerTier(customerId);
      const codeLimit = codeLimitForTier(tier);
      if (codeLimit === 0) {
        res.statusCode = 403;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "Referral codes are only available for Pro and Premier subscribers." }));
        return;
      }

      // Check if the code is already taken by someone else (or duplicated for this customer)
      const existing = await runQuery("SELECT customer_id FROM referrals WHERE code = ?", [trimmed]);
      if (existing.length > 0) {
        const owner = existing[0]?.customer_id || existing[0]?.["customer_id"] || "";
        if (owner !== customerId) {
          res.statusCode = 409;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "That referral code is already taken. Try another." }));
          return;
        }
        // Same customer owns this code — only a no-op rename (same code) is allowed
        const oldTrimmed = oldCode ? String(oldCode).trim().toUpperCase() : "";
        if (oldTrimmed !== trimmed) {
          res.statusCode = 409;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "You already have that referral code." }));
          return;
        }
        // Renaming to the same value — no-op success
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ code: trimmed, link: linkForCode(trimmed), success: true }));
        return;
      }

      if (oldCode) {
        // Rename: target the specific row
        const oldTrimmed = String(oldCode).trim().toUpperCase();
        const row = await runQuery(
          "SELECT code FROM referrals WHERE customer_id = ? AND code = ?",
          [customerId, oldTrimmed]
        );
        if (row.length === 0) {
          res.statusCode = 404;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "Referral code not found." }));
          return;
        }
        await runExec(
          "UPDATE referrals SET code = ? WHERE customer_id = ? AND code = ?",
          [trimmed, customerId, oldTrimmed]
        );
      } else {
        // Add new: enforce the code-count cap for the customer's tier
        const count = await runQuery("SELECT COUNT(*) as c FROM referrals WHERE customer_id = ?", [customerId]);
        const current = Number(count[0]?.c || count[0]?.["c"] || 0);
        if (current >= codeLimit) {
          res.statusCode = 400;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({
            error: `Referral code limit reached (${codeLimit}/${codeLimit}). Delete an unused code before adding another.`,
            codeLimit,
          }));
          return;
        }
        await runExec("INSERT OR IGNORE INTO referrals (code, customer_id) VALUES (?, ?)", [trimmed, customerId]);
      }

      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        code: trimmed,
        link: linkForCode(trimmed),
        success: true,
      }));
    } catch (e) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Internal error: " + String(e.message || e).substring(0, 100) }));
    }
    return;
  }

  // ================================================================
  // GET /api/referral?customerId=...&stats=true  — all codes + per-code stats
  // GET /api/referral?customerId=...             — all codes
  // GET /api/referral?lookup=CODE                — resolve short code
  // ================================================================
  if (url.includes("/api/referral") && req.method === "GET") {
    try {
      const params = new URL(url, "http://localhost").searchParams;
      const customerId = params.get("customerId");
      const statsMode = params.get("stats") === "true";
      const lookupCode = params.get("lookup");

      // Short code lookup (used by redirect.func)
      if (lookupCode) {
        if (!hasDB) {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ valid: false }));
          return;
        }
        const row = await runQuery("SELECT code FROM referrals WHERE code = ?", [lookupCode.toUpperCase()]);
        if (row.length > 0) {
          // Record click
          await runExec("INSERT INTO referral_clicks (code) VALUES (?)", [lookupCode.toUpperCase()]);
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ valid: true, code: row[0].code }));
        } else {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ valid: false }));
        }
        return;
      }

      // Codes + stats for a customer
      if (!customerId) {
        res.statusCode = 400;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "Missing customerId" }));
        return;
      }

      if (!hasDB) {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "Referral system initializing — check back soon." }));
        return;
      }

      const tier = await getCustomerTier(customerId);
      const codeLimit = codeLimitForTier(tier);

      if (statsMode) {
        const rows = await ensureCode(customerId, tier);
        const codes = [];
        for (const row of rows) {
          const code = row?.code || row?.["code"] || "";
          if (code) codes.push(await buildCodeStats(code));
        }
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ stats: { tier, codeLimit, codes } }));
        return;
      }

      // Non-stats: return all codes (auto-create the first for eligible subscribers)
      const rows = await ensureCode(customerId, tier);
      const codes = rows
        .map((r) => r?.code || r?.["code"] || "")
        .filter(Boolean)
        .map((code) => ({ code, link: linkForCode(code) }));
      const first = codes[0];
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        codes,
        tier,
        codeLimit,
        // Legacy single-code fields for backward compatibility
        code: first?.code || "",
        link: first?.link || "",
      }));
    } catch (e) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Internal error: " + String(e.message || e).substring(0, 100) }));
    }
    return;
  }

  res.statusCode = 405;
  res.end("Method Not Allowed");
}
