/**
 * Referral API — Codes + Stats (mirrors referral-entry.mjs endpoints)
 *
 * GET  /api/referral?customerId=xxx — returns all referral codes
 * GET  /api/referral?customerId=xxx&stats=true — returns per-code referral stats
 * POST /api/referral — set/rename a custom code ({ customerId, code, oldCode? })
 * POST /api/referral-delete — delete a code with zero conversions ({ customerId, code })
 */

import { createServerFn } from "@tanstack/react-start";
import { getOrCreateReferralCode, getReferralStats, deleteReferralCode } from "~/lib/referral";

export const getReferral = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { customerId?: string; stats?: string })
  .handler(async ({ data }) => {
    const customerId = data.customerId;
    if (!customerId) {
      return { error: "Missing customerId" };
    }

    try {
      // Stats mode — all codes with per-code stats
      if (data.stats === "true") {
        const stats = await getReferralStats(customerId);
        return {
          stats: {
            tier: stats.tier,
            codeLimit: stats.codeLimit,
            codes: stats.codes.map((c) => ({
              code: c.code,
              clicks: c.clicks,
              conversions: c.conversions,
              bountyEarnedCents: c.bountyEarnedCents,
              bountyEarnedDollars: (c.bountyEarnedCents / 100).toFixed(2),
              monthlyConversions: c.monthlyConversions,
              monthlyLimit: c.monthlyLimit,
              remainingThisMonth: c.remainingThisMonth,
            })),
          },
        };
      }

      // Code mode — all codes for the customer (Pro/Premier only for creation)
      const result = await getOrCreateReferralCode(customerId);
      if (!result) {
        return { error: "Referrals are only available for Pro and Premier subscribers" };
      }
      if (result.error) {
        return { error: result.error, codes: result.codes, tier: result.tier, codeLimit: result.codeLimit };
      }
      return { codes: result.codes, tier: result.tier, codeLimit: result.codeLimit };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { error: msg };
    }
  });

export const setReferralCode = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { customerId?: string; code?: string; oldCode?: string })
  .handler(async ({ data }) => {
    if (!data.customerId || !data.code) {
      return { error: "Missing customerId or code" };
    }
    try {
      const result = await getOrCreateReferralCode(data.customerId, {
        code: data.code,
        oldCode: data.oldCode,
      });
      if (!result) {
        return { error: "Referrals are only available for Pro and Premier subscribers" };
      }
      if (result.error) {
        return { error: result.error, codes: result.codes, tier: result.tier, codeLimit: result.codeLimit };
      }
      const code = result.codes.find((c) => c.code === String(data.code).trim().toUpperCase());
      return { success: true, code: code?.code || "", link: code?.link || "" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { error: msg };
    }
  });

export const removeReferralCode = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { customerId?: string; code?: string })
  .handler(async ({ data }) => {
    if (!data.customerId || !data.code) {
      return { error: "Missing customerId or code" };
    }
    try {
      const result = await deleteReferralCode(data.customerId, data.code);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, error: msg };
    }
  });
