/**
 * Referral Lib — Turso DB access for referral codes and stats.
 *
 * Uses the same HTTP API pattern as referral-entry.mjs (Turso v2 pipeline).
 */

function getTursoConfig(): { url: string; token: string } | null {
  const dbUrl = process.env.TEAM_DB_URL;
  const token = process.env.TEAM_DB_AUTH_TOKEN;
  if (!dbUrl || !token) return null;
  return {
    url: dbUrl.replace("libsql://", "https://"),
    token,
  };
}

interface QueryRow {
  [key: string]: any;
}

async function runQuery(sql: string, params: string[] = []): Promise<QueryRow[]> {
  const cfg = getTursoConfig();
  if (!cfg) return [];

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(cfg.url + "/v2/pipeline", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + cfg.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            type: "execute",
            stmt: {
              sql,
              args: params.map((v) => ({ type: "text", value: String(v) })),
            },
          },
          { type: "close" },
        ],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    const j = await r.json();
    const results = j.results?.[0]?.response?.result;
    const rows = results?.rows || [];
    const cols = (results?.cols || []).map((c: any) => c.name);

    return rows.map((row: any) => {
      const obj: QueryRow = {};
      if (Array.isArray(row) && cols.length > 0) {
        row.forEach((cell: any, i: number) => {
          obj[cols[i]] = cell?.value;
        });
      } else if (row.columns) {
        row.columns.forEach((c: any) => {
          obj[c.name] = c.value;
        });
      } else {
        Object.keys(row).forEach((k) => {
          obj[k] = row[k]?.value != null ? row[k].value : row[k];
        });
      }
      return obj;
    });
  } catch (e) {
    console.error(
      "Turso query error:",
      String((e as any)?.message || e).substring(0, 200)
    );
    return [];
  }
}

async function runExec(sql: string, params: string[] = []): Promise<boolean> {
  const cfg = getTursoConfig();
  if (!cfg) return false;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    await fetch(cfg.url + "/v2/pipeline", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + cfg.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            type: "execute",
            stmt: {
              sql,
              args: params.map((v) => ({ type: "text", value: String(v) })),
            },
          },
          { type: "close" },
        ],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return true;
  } catch (e) {
    console.error(
      "Turso exec error:",
      String((e as any)?.message || e).substring(0, 200)
    );
    return false;
  }
}

/**
 * Get or create a referral code for a Stripe customer.
 * Works for both Pro and Premier subscribers.
 *
 * @param customerId — Stripe customer ID (e.g. "cus_xxx")
 * @returns { code, link } or null if referrals aren't available
 */
export async function getOrCreateReferralCode(
  customerId: string
): Promise<{ code: string; link: string } | null> {
  if (!getTursoConfig()) return null;

  // Check if customer already has a code
  const existing = await runQuery(
    "SELECT code FROM referrals WHERE customer_id = ?",
    [customerId]
  );

  let code: string;

  if (existing.length === 0) {
    // Generate a new random code
    code =
      "LNS-" +
      Math.random().toString(36).substring(2, 6).toUpperCase() +
      "-" +
      Math.random().toString(36).substring(2, 6).toUpperCase();

    await runExec(
      "INSERT OR IGNORE INTO referrals (code, customer_id) VALUES (?, ?)",
      [code, customerId]
    );
  } else {
    code = existing[0]?.code || existing[0]?.["code"] || "";
  }

  if (!code) return null;

  return {
    code,
    link: "https://www.lastnotesold.com/?ref=" + code,
  };
}

export interface ReferralStats {
  code: string;
  clicks: number;
  conversions: number;
  bountyEarnedCents: number;
  monthlyConversions: number;
  monthlyLimit: number;
  remainingThisMonth: number;
}

/**
 * Get referral stats for a Stripe customer.
 */
export async function getReferralStats(
  customerId: string
): Promise<ReferralStats> {
  const empty: ReferralStats = {
    code: "",
    clicks: 0,
    conversions: 0,
    bountyEarnedCents: 0,
    monthlyConversions: 0,
    monthlyLimit: 20,
    remainingThisMonth: 20,
  };

  if (!getTursoConfig()) return empty;

  const existing = await runQuery(
    "SELECT code FROM referrals WHERE customer_id = ?",
    [customerId]
  );
  const code = existing[0]?.code || existing[0]?.["code"] || "";
  if (!code) return empty;

  const clicks = await runQuery(
    "SELECT COUNT(*) as c FROM referral_clicks WHERE code = ?",
    [code]
  );
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
  const totalCents = Number(
    conversions[0]?.total || conversions[0]?.["total"] || 0
  );
  const monthlyConvCount = Number(
    monthConversions[0]?.c || monthConversions[0]?.["c"] || 0
  );
  const monthlyLimit = 20;

  return {
    code,
    clicks: clickCount,
    conversions: convCount,
    bountyEarnedCents: totalCents,
    monthlyConversions: monthlyConvCount,
    monthlyLimit,
    remainingThisMonth: Math.max(0, monthlyLimit - monthlyConvCount),
  };
}
