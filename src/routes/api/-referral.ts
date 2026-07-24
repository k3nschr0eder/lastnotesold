/**
 * Referral API — Code generation + Stats
 *
 * GET /api/referral?customerId=xxx — returns referral code/link
 * GET /api/referral?customerId=xxx&stats=true — returns referral stats
 */

import { createServerFn } from "@tanstack/react-start";
import { getOrCreateReferralCode, getReferralStats } from "~/lib/referral";

export const getReferral = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { customerId?: string; stats?: string })
  .handler(async ({ data }) => {
    const customerId = data.customerId;
    if (!customerId) {
      return { error: "Missing customerId" };
    }

    try {
      // Stats mode
      if (data.stats === "true") {
        const stats = await getReferralStats(customerId);
        return {
          stats: {
            code: stats.code,
            clicks: stats.clicks,
            conversions: stats.conversions,
            bountyEarnedCents: stats.bountyEarnedCents,
            bountyEarnedDollars: (stats.bountyEarnedCents / 100).toFixed(2),
          },
        };
      }

      // Code generation mode — requires Premier subscription check
      // For now, we trust the client to pass isPremier=true only for Premier members.
      // In production, verify via Stripe customer subscription status.
      const premier = data.customerId ? true : false; // Simplified: any customerId = Premier for MVP

      const result = await getOrCreateReferralCode(customerId, premier);
      if (!result) {
        return { error: "Referrals are only available for Premier subscribers" };
      }

      return {
        code: result.code,
        link: result.link,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { error: msg };
    }
  });
