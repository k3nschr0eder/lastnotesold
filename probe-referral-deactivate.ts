/**
 * Referral deactivate/re-activate probe — direct lib-level verification (LNS port).
 *
 * Flow: seed 2 codes → stats active+primary → deactivate A → stats inactive +
 *       primary switches to B → idempotent re-deactivate → stranger 403 →
 *       unknown 404 → activate A → stats active + primary restored →
 *       idempotent re-activate → all-inactive auto-generates a fresh code →
 *       hard-cleanup of ONLY the probe rows.
 *
 * Runs against the shared Turso DB (TEAM_DB_URL/TEAM_DB_AUTH_TOKEN from .env.local).
 * Uses unique probe codes so cleanup never touches real rows.
 *
 * Run:  bun run probe-referral-deactivate.ts
 *       (bun auto-loads .env.local)
 */
import {
  deactivateReferralCode,
  activateReferralCode,
  getReferralStats,
} from "./src/lib/referral";

const SUFFIX = String(Date.now()).slice(-6);
const CUSTOMER = `cus_probe_deactivate_${SUFFIX}`;
const CODE_A = "PROBE-DA-" + SUFFIX + "-A";
const CODE_B = "PROBE-DA-" + SUFFIX + "-B";
const STRANGER = "cus_probe_stranger_" + SUFFIX;

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}

function turso(): { url: string; token: string } | null {
  const url = (process.env.TEAM_DB_URL || "").replace("libsql://", "https://");
  const token = process.env.TEAM_DB_AUTH_TOKEN || "";
  if (!url || !token) return null;
  return { url, token };
}
async function tursoExec(sql: string, params: string[] = []): Promise<boolean> {
  const cfg = turso();
  if (!cfg) return false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    await fetch(cfg.url + "/v2/pipeline", {
      method: "POST",
      headers: { Authorization: "Bearer " + cfg.token, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          { type: "execute", stmt: { sql, args: params.map((v) => ({ type: "text", value: v })) } },
          { type: "close" },
        ],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}
async function tursoQuery(sql: string, params: string[] = []): Promise<any[]> {
  const cfg = turso();
  if (!cfg) return [];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(cfg.url + "/v2/pipeline", {
      method: "POST",
      headers: { Authorization: "Bearer " + cfg.token, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          { type: "execute", stmt: { sql, args: params.map((v) => ({ type: "text", value: v })) } },
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
      const obj: any = {};
      if (Array.isArray(row) && cols.length > 0) {
        row.forEach((cell: any, i: number) => { obj[cols[i]] = cell?.value; });
      } else if (row.columns) {
        row.columns.forEach((c: any) => { obj[c.name] = c.value; });
      } else {
        Object.keys(row).forEach((k) => { obj[k] = row[k]?.value != null ? row[k].value : row[k]; });
      }
      return obj;
    });
  } catch (e) {
    console.error("  Turso query error:", String((e as Error).message || e).substring(0, 160));
    return [];
  }
}

async function cleanup() {
  for (const code of [CODE_A, CODE_B]) {
    await tursoExec("DELETE FROM referral_clicks WHERE code = ?", [code]);
    await tursoExec("DELETE FROM referral_conversions WHERE code = ?", [code]);
    await tursoExec("DELETE FROM referrals WHERE code = ?", [code]);
  }
  // Any auto-generated code from the all-inactive step
  const leftover = await tursoQuery("SELECT code FROM referrals WHERE customer_id = ?", [CUSTOMER]);
  for (const row of leftover) {
    const code = row?.code || row?.["code"] || "";
    if (code && code.startsWith("LNS-")) {
      await tursoExec("DELETE FROM referral_clicks WHERE code = ?", [code]);
      await tursoExec("DELETE FROM referral_conversions WHERE code = ?", [code]);
      await tursoExec("DELETE FROM referrals WHERE code = ?", [code]);
    }
  }
}

async function main() {
  console.log("Referral deactivate/re-activate probe (LNS) — customer", CUSTOMER);
  if (!turso()) {
    console.log("  FAIL TEAM_DB_URL/TEAM_DB_AUTH_TOKEN missing (run with .env.local present)");
    process.exit(1);
  }

  // 1. Seed two codes directly (tier enforcement is Stripe-bound; the flows under
  //    test are deactivate/activate/stats, which are owner-scoped, not tier-gated).
  await tursoExec("INSERT OR IGNORE INTO referrals (code, customer_id) VALUES (?, ?)", [CODE_A, CUSTOMER]);
  await tursoExec("INSERT OR IGNORE INTO referrals (code, customer_id) VALUES (?, ?)", [CODE_B, CUSTOMER]);

  // 2. Initial stats: both active, primary = A (first by id)
  let s = await getReferralStats(CUSTOMER);
  check("initial: both codes present", (s.codes || []).length === 2, JSON.stringify(s.codes));
  check("initial: A active", s.codeActive?.[CODE_A] === true, JSON.stringify(s.codeActive));
  check("initial: B active", s.codeActive?.[CODE_B] === true, JSON.stringify(s.codeActive));
  check("initial: primary = A", s.code === CODE_A, `primary=${s.code}`);

  // 3. Deactivate A
  const d1 = await deactivateReferralCode(CUSTOMER, CODE_A);
  check("deactivate A succeeds", d1.success === true, JSON.stringify(d1));
  s = await getReferralStats(CUSTOMER);
  check("post-deactivate: A inactive", s.codeActive?.[CODE_A] === false, JSON.stringify(s.codeActive));
  check("post-deactivate: B still active", s.codeActive?.[CODE_B] === true, JSON.stringify(s.codeActive));
  check("post-deactivate: primary switches to B", s.code === CODE_B, `primary=${s.code}`);

  // 4. Idempotent re-deactivate
  const d2 = await deactivateReferralCode(CUSTOMER, CODE_A);
  check("re-deactivate idempotent", d2.success === true, JSON.stringify(d2));

  // 5. Stranger cannot deactivate
  const d3 = await deactivateReferralCode(STRANGER, CODE_A);
  check("stranger deactivate blocked", d3.success === false && /own referral/.test(d3.error || ""), JSON.stringify(d3));

  // 6. Unknown code
  const d4 = await deactivateReferralCode(CUSTOMER, "PROBE-NOPE-999999");
  check("unknown deactivate 404", d4.success === false && /not found/.test(d4.error || ""), JSON.stringify(d4));

  // 7. Activate A
  const a1 = await activateReferralCode(CUSTOMER, CODE_A);
  check("activate A succeeds", a1.success === true, JSON.stringify(a1));
  s = await getReferralStats(CUSTOMER);
  check("post-activate: A active again", s.codeActive?.[CODE_A] === true, JSON.stringify(s.codeActive));
  check("post-activate: primary restored to A", s.code === CODE_A, `primary=${s.code}`);

  // 8. Idempotent re-activate
  const a2 = await activateReferralCode(CUSTOMER, CODE_A);
  check("re-activate idempotent", a2.success === true, JSON.stringify(a2));

  // 9. Stranger cannot activate
  const a3 = await activateReferralCode(STRANGER, CODE_B);
  check("stranger activate blocked", a3.success === false && /own referral/.test(a3.error || ""), JSON.stringify(a3));

  // 10. All-inactive + free tier (probe customer has no Stripe subscription) →
  //     NO auto-gen (tier-gated), primary falls back to the first code.
  await deactivateReferralCode(CUSTOMER, CODE_A);
  await deactivateReferralCode(CUSTOMER, CODE_B);
  s = await getReferralStats(CUSTOMER);
  check("all-inactive (free tier): no auto-gen", (s.codes || []).length === 2, JSON.stringify(s.codes));
  check("all-inactive: both marked inactive", s.codeActive?.[CODE_A] === false && s.codeActive?.[CODE_B] === false, JSON.stringify(s.codeActive));
  check("all-inactive: primary falls back to first code", s.code === CODE_A, `primary=${s.code}`);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await cleanup();
  console.log("Cleanup done — probe rows removed.");
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Probe crashed:", String(e.message || e));
  cleanup().finally(() => process.exit(1));
});
