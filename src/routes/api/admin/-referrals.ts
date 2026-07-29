/**
 * GET /api/admin/referrals — fetch referral stats from Turso DB
 */

import { createServerFn } from "@tanstack/react-start";
import { getAdminSession } from "~/lib/admin-auth";

function getTursoConfig(): { url: string; token: string } | null {
  const dbUrl = process.env.TEAM_DB_URL;
  const token = process.env.TEAM_DB_AUTH_TOKEN;
  if (!dbUrl || !token) return null;
  return { url: dbUrl.replace("libsql://", "https://"), token };
}

async function runQuery(sql: string, params: string[] = []): Promise<any[]> {
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
          { type: "execute", stmt: { sql, args: params.map((v) => ({ type: "text", value: String(v) })) } },
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
  } catch { return []; }
}

export const getAdminReferrals = createServerFn({ method: "GET" }).handler(async () => {
  const session = getAdminSession();
  if (!session) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const totalRef = await runQuery("SELECT COUNT(*) as c FROM referrals");
    const totalReferrals = Number(totalRef[0]?.c || 0);
    const totalClick = await runQuery("SELECT COUNT(*) as c FROM referral_clicks");
    const totalClicks = Number(totalClick[0]?.c || 0);
    const totalConv = await runQuery("SELECT COUNT(*) as c, COALESCE(SUM(bounty_amount_cents), 0) as total FROM referral_conversions");
    const totalConversions = Number(totalConv[0]?.c || 0);
    const totalBounties = Number(totalConv[0]?.total || 0);

    const topRef = await runQuery(
      `SELECT r.code,
        (SELECT COUNT(*) FROM referral_clicks c WHERE c.code = r.code) as clicks,
        (SELECT COUNT(*) FROM referral_conversions v WHERE v.code = r.code) as conversions,
        (SELECT COALESCE(SUM(v2.bounty_amount_cents), 0) FROM referral_conversions v2 WHERE v2.code = r.code) as bounties
      FROM referrals r ORDER BY conversions DESC LIMIT 20`
    );

    const topReferrers = topRef.map((r: any) => ({
      code: r.code || "",
      clicks: Number(r.clicks || 0),
      conversions: Number(r.conversions || 0),
      bountiesEarned: Number(r.bounties || 0),
    }));

    const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;

    return {
      totalReferrals, totalClicks, totalConversions,
      conversionRate: Math.round(conversionRate * 100) / 100,
      totalBounties, topReferrers,
    };
  } catch (e) {
    console.error("referrals error:", e);
    return { totalReferrals: 0, totalClicks: 0, totalConversions: 0, conversionRate: 0, totalBounties: 0, topReferrers: [] };
  }
});
