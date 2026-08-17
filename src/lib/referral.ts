/**
 * Referral Lib — Turso DB access for referral codes and stats.
 *
 * Uses the same HTTP API pattern as referral-entry.mjs (Turso v2 pipeline).
 * Mirrors the multi-code logic in referral-entry.mjs:
 *   - Pro = 1 referral code, Premier = up to 3 (tier enforced via Stripe)
 *   - 20 conversions/month per code
 *   - Code deletion allowed only when the code has zero conversions
 */

import { ALL_PRICE_IDS } from "~/lib/stripe";
import type { TierName } from "~/lib/tiers";

const MONTHLY_CONVERSION_LIMIT = 20;

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

/** Code capacity by tier: Pro = 1, Premier = 3, Free = 0 (no referral program). */
export function codeLimitForTier(tier: TierName): number {
  if (tier === "premier") return 3;
  if (tier === "pro") return 1;
  return 0;
}

/**
 * Determine the customer's subscription tier via the Stripe API.
 * Price ID matching first (most reliable), product-name fallback for brand check.
 * Fails closed to "free" (no code creation) when the lookup fails.
 */
export async function getCustomerTier(customerId: string): Promise<TierName> {
  if (!customerId) return "free";
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (!key) {
    console.error("[Referral] STRIPE_SECRET_KEY is not set — tier enforcement will fail closed");
    return "free";
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(
      `https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=active&limit=1`,
      { headers: { Authorization: "Basic " + btoa(key + ":") }, signal: ctrl.signal },
    );
    clearTimeout(timer);
    const data = await res.json();
    const sub = data.data?.[0];
    if (!sub) return "free";

    const item = sub.items?.data?.[0];
    const priceId: string = item?.price?.id;
    if ((ALL_PRICE_IDS.PREMIER as readonly string[]).includes(priceId)) return "premier";
    if ((ALL_PRICE_IDS.PRO as readonly string[]).includes(priceId)) return "pro";

    // Price ID not recognized — check the product name for brand
    const productId: string = item?.price?.product;
    if (productId && typeof productId === "string") {
      try {
        const prodRes = await fetch(`https://api.stripe.com/v1/products/${productId}`, {
          headers: { Authorization: "Basic " + btoa(key + ":") },
          signal: AbortSignal.timeout(5000),
        });
        const prod = await prodRes.json();
        const productName = (prod.name || "").toLowerCase();
        if (productName.includes("lastnotesold")) return "pro";
      } catch (e) {
        console.error("[Referral] Stripe product lookup failed:", e);
      }
    }
    return "free";
  } catch (e) {
    console.error("[Referral] Tier lookup failed:", String((e as any)?.message || e).substring(0, 120));
    return "free";
  }
}

function linkForCode(code: string): string {
  return "https://www.lastnotesold.com/" + code;
}

function isValidCode(code: string): boolean {
  return /^[A-Z0-9][A-Z0-9-]{1,18}[A-Z0-9]$/.test(code);
}

export interface ReferralCodeRef {
  code: string;
  link: string;
}

export interface ReferralCodesResult {
  codes: ReferralCodeRef[];
  tier: TierName;
  codeLimit: number;
  /** Set when a requested set/rename failed (e.g. taken code, limit reached). */
  error?: string;
}

export interface ReferralCodeStats {
  code: string;
  active?: boolean;
  clicks: number;
  conversions: number;
  bountyEarnedCents: number;
  monthlyConversions: number;
  monthlyLimit: number;
  remainingThisMonth: number;
}

export interface ReferralStatsResult {
  tier: TierName;
  codeLimit: number;
  codes: ReferralCodeStats[];
  /** Primary (first ACTIVE) code — deactivated codes never serve as the shareable ref. */
  code?: string;
  /** Per-code active map. */
  codeActive?: Record<string, boolean>;
}

export interface ReferralMutationResult {
  success: boolean;
  error?: string;
  code?: string;
  link?: string;
}

/**
 * Get (or create) referral codes for a Stripe customer.
 *
 * Without a specific code, returns ALL codes for the customer (auto-creating the
 * first one for eligible Pro/Premier subscribers). Pass `opts.code` to set/rename
 * a custom code (with `opts.oldCode` targeting a specific row to rename).
 */
export async function getOrCreateReferralCode(
  customerId: string,
  opts?: { code?: string; oldCode?: string }
): Promise<ReferralCodesResult | null> {
  if (!getTursoConfig()) return null;

  const tier = await getCustomerTier(customerId);
  const codeLimit = codeLimitForTier(tier);

  // Fetch all codes for the customer (auto-creates the first for eligible subscribers).
  const fetchCodes = async (): Promise<ReferralCodesResult> => {
    const rows = await runQuery(
      "SELECT code FROM referrals WHERE customer_id = ? ORDER BY id ASC",
      [customerId]
    );
    let codeRows = rows;
    if (codeRows.length === 0 && codeLimit > 0) {
      const gen =
        "LNS-" +
        Math.random().toString(36).substring(2, 6).toUpperCase() +
        "-" +
        Math.random().toString(36).substring(2, 6).toUpperCase();
      await runExec("INSERT OR IGNORE INTO referrals (code, customer_id) VALUES (?, ?)", [gen, customerId]);
      codeRows = [{ code: gen }];
    }
    const codes = codeRows
      .map((r) => r?.code || r?.["code"] || "")
      .filter(Boolean)
      .map((code) => ({ code, link: linkForCode(code) }));
    return { codes, tier, codeLimit };
  };

  const fail = async (error: string): Promise<ReferralCodesResult> => ({
    ...(await fetchCodes()),
    error,
  });

  // Set / rename a custom code
  if (opts?.code) {
    const trimmed = String(opts.code).trim().toUpperCase();
    if (!isValidCode(trimmed)) {
      return fail("Invalid code format. Use 3-20 letters, numbers, and hyphens.");
    }
    if (codeLimit === 0) {
      return fail("Referral codes are only available for Pro and Premier subscribers.");
    }
    const existing = await runQuery("SELECT customer_id FROM referrals WHERE code = ?", [trimmed]);
    if (existing.length > 0) {
      const owner = existing[0]?.customer_id || existing[0]?.["customer_id"] || "";
      if (owner !== customerId) {
        return fail("That referral code is already taken. Try another.");
      }
      const oldTrimmed = opts.oldCode ? String(opts.oldCode).trim().toUpperCase() : "";
      if (oldTrimmed !== trimmed) {
        return fail("You already have that referral code.");
      }
    }
    if (opts.oldCode) {
      const oldTrimmed = String(opts.oldCode).trim().toUpperCase();
      const row = await runQuery(
        "SELECT code FROM referrals WHERE customer_id = ? AND code = ?",
        [customerId, oldTrimmed]
      );
      if (row.length === 0) {
        return fail("Referral code not found.");
      }
      await runExec(
        "UPDATE referrals SET code = ? WHERE customer_id = ? AND code = ?",
        [trimmed, customerId, oldTrimmed]
      );
    } else {
      const count = await runQuery("SELECT COUNT(*) as c FROM referrals WHERE customer_id = ?", [customerId]);
      const current = Number(count[0]?.c || count[0]?.["c"] || 0);
      if (current >= codeLimit) {
        return fail(`Referral code limit reached (${codeLimit}/${codeLimit}). Delete an unused code before adding another.`);
      }
      await runExec("INSERT OR IGNORE INTO referrals (code, customer_id) VALUES (?, ?)", [trimmed, customerId]);
    }
  }

  return fetchCodes();
}

/**
 * Delete a referral code. Allowed only when the code has zero conversions.
 */
export async function deleteReferralCode(
  customerId: string,
  code: string
): Promise<ReferralMutationResult> {
  if (!getTursoConfig()) return { success: false, error: "Referral system unavailable." };

  const tier = await getCustomerTier(customerId);
  if (codeLimitForTier(tier) === 0) {
    return { success: false, error: "Referral codes are only available for Pro and Premier subscribers." };
  }

  const trimmed = String(code).trim().toUpperCase();
  const owned = await runQuery(
    "SELECT code FROM referrals WHERE customer_id = ? AND code = ?",
    [customerId, trimmed]
  );
  if (owned.length === 0) {
    return { success: false, error: "Referral code not found." };
  }

  const conv = await runQuery("SELECT COUNT(*) as c FROM referral_conversions WHERE code = ?", [trimmed]);
  const convCount = Number(conv[0]?.c || conv[0]?.["c"] || 0);
  if (convCount > 0) {
    return { success: false, error: "You can't delete a referral code that already has conversions." };
  }

  const ok = await runExec("DELETE FROM referrals WHERE customer_id = ? AND code = ?", [customerId, trimmed]);
  return ok ? { success: true, code: trimmed } : { success: false, error: "Delete failed. Try again." };
}
/**
 * Soft-deactivate a referral code. The code stops accepting new referrals
 * (no clicks, no conversions) but is not deleted. Owner-scoped and idempotent.
 */
export async function deactivateReferralCode(
  customerId: string,
  code: string
): Promise<ReferralMutationResult> {
  if (!getTursoConfig()) return { success: false, error: "Referral system unavailable." };
  const trimmed = String(code).trim().toUpperCase();
  const owned = await runQuery("SELECT customer_id, active FROM referrals WHERE code = ?", [trimmed]);
  if (owned.length === 0) {
    return { success: false, error: "Referral code not found." };
  }
  if (owned[0].customer_id !== customerId) {
    return { success: false, error: "You can only deactivate your own referral codes." };
  }
  if (Number(owned[0].active) === 0) {
    return { success: true, code: trimmed }; // already inactive — idempotent
  }
  const ok = await runExec("UPDATE referrals SET active = 0 WHERE code = ? AND customer_id = ?", [trimmed, customerId]);
  return ok ? { success: true, code: trimmed } : { success: false, error: "Deactivate failed. Try again." };
}
/**
 * Re-activate a deactivated referral code. Owner-scoped and idempotent.
 */
export async function activateReferralCode(
  customerId: string,
  code: string
): Promise<ReferralMutationResult> {
  if (!getTursoConfig()) return { success: false, error: "Referral system unavailable." };
  const trimmed = String(code).trim().toUpperCase();
  const owned = await runQuery("SELECT customer_id, active FROM referrals WHERE code = ?", [trimmed]);
  if (owned.length === 0) {
    return { success: false, error: "Referral code not found." };
  }
  if (owned[0].customer_id !== customerId) {
    return { success: false, error: "You can only activate your own referral codes." };
  }
  if (Number(owned[0].active) !== 0) {
    return { success: true, code: trimmed }; // already active — idempotent
  }
  const ok = await runExec("UPDATE referrals SET active = 1 WHERE code = ? AND customer_id = ?", [trimmed, customerId]);
  return ok ? { success: true, code: trimmed } : { success: false, error: "Activate failed. Try again." };
}

/**
 * Get per-code referral stats for a Stripe customer.
 */
export async function getReferralStats(customerId: string): Promise<ReferralStatsResult> {
  const empty: ReferralStatsResult = { tier: "free", codeLimit: 0, codes: [] };

  if (!getTursoConfig()) return empty;

  const tier = await getCustomerTier(customerId);
  const codeLimit = codeLimitForTier(tier);

  let rows = await runQuery(
    "SELECT code, active FROM referrals WHERE customer_id = ? ORDER BY id ASC",
    [customerId]
  );
  const codeActive: Record<string, boolean> = {};
  rows.forEach((r) => {
    const c = r?.code || r?.["code"] || "";
    if (c) codeActive[c] = Number(r?.active ?? r?.["active"] ?? 1) !== 0;
  });
  const allInactive = Object.keys(codeActive).length > 0 && Object.values(codeActive).every((a) => !a);
  if ((rows.length === 0 || allInactive) && codeLimit > 0) {
    const gen =
      "LNS-" +
      Math.random().toString(36).substring(2, 6).toUpperCase() +
      "-" +
      Math.random().toString(36).substring(2, 6).toUpperCase();
    await runExec("INSERT OR IGNORE INTO referrals (code, customer_id) VALUES (?, ?)", [gen, customerId]);
    rows = [{ code: gen, active: 1 }];
    codeActive[gen] = true;
  }
  const primaryCode = Object.keys(codeActive).find((c) => codeActive[c]) || Object.keys(codeActive)[0] || "";

  const codes: ReferralCodeStats[] = [];
  for (const row of rows) {
    const code = row?.code || row?.["code"] || "";
    if (!code) continue;

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

    codes.push({
      code,
      active: codeActive[code] !== false,
      clicks: clickCount,
      conversions: convCount,
      bountyEarnedCents: totalCents,
      monthlyConversions: monthlyConvCount,
      monthlyLimit: MONTHLY_CONVERSION_LIMIT,
      remainingThisMonth: Math.max(0, MONTHLY_CONVERSION_LIMIT - monthlyConvCount),
    });
  }

  return { tier, codeLimit, code: primaryCode, codeActive, codes };
}
