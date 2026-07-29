/**
 * GET /api/admin/coupons — fetch Stripe coupons and promotion codes
 */

import { createServerFn } from "@tanstack/react-start";
import { getAdminSession } from "~/lib/admin-auth";

export const getAdminCoupons = createServerFn({ method: "GET" }).handler(async () => {
  const session = getAdminSession();
  if (!session) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { coupons: [] };

  const auth = "Basic " + Buffer.from(key + ":").toString("base64");

  try {
    // Fetch coupons
    let allCoupons: any[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;
    while (hasMore) {
      const url =
        `https://api.stripe.com/v1/coupons?limit=100` +
        (startingAfter ? `&starting_after=${startingAfter}` : "");
      const res = await fetch(url, { headers: { Authorization: auth } });
      const data = await res.json();
      allCoupons.push(...(data.data || []));
      hasMore = data.has_more;
      startingAfter = data.data?.length ? data.data[data.data.length - 1].id : undefined;
    }

    // Fetch promotion codes
    let allPromoCodes: any[] = [];
    hasMore = true;
    startingAfter = undefined;
    while (hasMore) {
      const url =
        `https://api.stripe.com/v1/promotion_codes?limit=100` +
        (startingAfter ? `&starting_after=${startingAfter}` : "");
      const res = await fetch(url, { headers: { Authorization: auth } });
      const data = await res.json();
      allPromoCodes.push(...(data.data || []));
      hasMore = data.has_more;
      startingAfter = data.data?.length ? data.data[data.data.length - 1].id : undefined;
    }

    const coupons = allCoupons.map((c) => ({
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
    }));

    for (const pc of allPromoCodes) {
      const c = pc.coupon;
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

    return { coupons };
  } catch (e) {
    console.error("coupons error:", e);
    return { coupons: [], error: String(e) };
  }
});
