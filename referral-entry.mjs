// Self-contained referral API — uses Turso HTTP API, no external deps
// Handles:
//   GET  /api/referral?customerId=...&stats=true   — get code + stats
//   GET  /api/referral?lookup=CODE                   — resolve a short code (for redirect.func)
//   POST /api/referral                              — set custom code (body: { customerId, code })
//   POST /api/referral-click                        — record a click (body: { code })
//   POST /api/referral-conversion                   — record a conversion (body: { code, stripeCustomerId, bountyAmountCents })

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

      if (monthlyConversions >= 20) {
        res.statusCode = 429;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          error: "Monthly referral limit reached (20/20). New conversions will count next month.",
          monthlyConversions,
          monthlyLimit: 20,
        }));
        return;
      }

      const amount = Number(bountyAmountCents) || 500;
      await runExec(
        "INSERT INTO referral_conversions (code, stripe_customer_id, bounty_amount_cents) VALUES (?, ?, ?)",
        [code, stripeCustomerId || "", String(amount)]
      );

      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        recorded: true,
        monthlyConversions: monthlyConversions + 1,
        monthlyLimit: 20,
        remainingThisMonth: 20 - (monthlyConversions + 1),
      }));
    } catch (e) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Internal error: " + String(e.message || e).substring(0, 100) }));
    }
    return;
  }

  // ================================================================
  // POST /api/referral — set custom code
  // Body: { customerId: "cus_...", code: "SNTCOIN" }
  // ================================================================
  if (url.includes("/api/referral") && req.method === "POST") {
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

      // Validate code format: 3-20 chars, alphanumeric + hyphens only
      const trimmed = String(code).trim().toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9-]{1,18}[A-Z0-9]$/.test(trimmed)) {
        res.statusCode = 400;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          error: "Invalid code format. Use 3-20 letters, numbers, and hyphens (cannot start or end with hyphen).",
        }));
        return;
      }

      // Check if code is already taken by someone else
      const existing = await runQuery(
        "SELECT customer_id FROM referrals WHERE code = ?",
        [trimmed]
      );
      if (existing.length > 0 && existing[0]?.customer_id !== customerId) {
        res.statusCode = 409;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "That referral code is already taken. Try another." }));
        return;
      }

      // Check if customer already has a code
      const custRow = await runQuery(
        "SELECT code FROM referrals WHERE customer_id = ?",
        [customerId]
      );

      if (custRow.length > 0) {
        // Update existing code
        await runExec("UPDATE referrals SET code = ? WHERE customer_id = ?", [trimmed, customerId]);
      } else {
        // Insert new
        await runExec("INSERT OR IGNORE INTO referrals (code, customer_id) VALUES (?, ?)", [trimmed, customerId]);
      }

      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        code: trimmed,
        link: "https://www.lastnotesold.com/" + trimmed,
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
  // GET /api/referral?customerId=...&stats=true  — get code + stats
  // GET /api/referral?lookup=CODE                 — resolve short code
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

      // Generate/get code + stats for a customer
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

      const existing = await runQuery("SELECT code FROM referrals WHERE customer_id = ?", [customerId]);
      let code;
      if (existing.length === 0) {
        code = "LNS-" + Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
        await runExec("INSERT OR IGNORE INTO referrals (code, customer_id) VALUES (?, ?)", [code, customerId]);
      } else {
        code = existing[0]?.code || existing[0]?.["code"] || "";
      }

      if (statsMode) {
        const clicks = await runQuery("SELECT COUNT(*) as c FROM referral_clicks WHERE code = ?", [code]);
        const conversions = await runQuery("SELECT COUNT(*) as c, COALESCE(SUM(bounty_amount_cents), 0) as total FROM referral_conversions WHERE code = ?", [code]);
        const monthConversions = await runQuery(
          "SELECT COUNT(*) as c FROM referral_conversions WHERE code = ? AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')",
          [code]
        );

        const clickCount = Number(clicks[0]?.c || clicks[0]?.["c"] || 0);
        const convCount = Number(conversions[0]?.c || conversions[0]?.["c"] || 0);
        const totalCents = Number(conversions[0]?.total || conversions[0]?.["total"] || 0);
        const monthlyConvCount = Number(monthConversions[0]?.c || monthConversions[0]?.["c"] || 0);
        const monthlyLimit = 20;

        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          stats: {
            code,
            clicks: clickCount,
            conversions: convCount,
            bountyEarnedCents: totalCents,
            bountyEarnedDollars: (totalCents / 100).toFixed(2),
            monthlyConversions: monthlyConvCount,
            monthlyLimit,
            remainingThisMonth: Math.max(0, monthlyLimit - monthlyConvCount),
          },
        }));
        return;
      }

      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ code, link: "https://www.lastnotesold.com/?ref=" + code }));
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
