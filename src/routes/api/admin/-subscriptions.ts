/**
 * GET /api/admin/subscriptions — fetch all subscriptions from Stripe
 */

import { createServerFn } from "@tanstack/react-start";
import { getAdminSession } from "~/lib/admin-auth";

export const getAdminSubscriptions = createServerFn({ method: "GET" }).handler(async () => {
  const session = getAdminSession();
  if (!session) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { customers: [] };

  const auth = "Basic " + Buffer.from(key + ":").toString("base64");

  try {
    const allSubs: any[] = [];
    for (const status of ["active", "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired"]) {
      let hasMore = true;
      let startingAfter: string | undefined;
      while (hasMore) {
        const url =
          `https://api.stripe.com/v1/subscriptions?status=${status}&limit=100` +
          (startingAfter ? `&starting_after=${startingAfter}` : "");
        const res = await fetch(url, { headers: { Authorization: auth } });
        const data = await res.json();
        allSubs.push(...(data.data || []));
        hasMore = data.has_more;
        startingAfter = data.data?.length ? data.data[data.data.length - 1].id : undefined;
      }
    }

    const customerCache = new Map<string, string>();
    const customers: any[] = [];

    for (const sub of allSubs) {
      const customerId = sub.customer;
      let email = customerCache.get(customerId) || "";
      if (!email) {
        try {
          const cRes = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
            headers: { Authorization: auth },
          });
          const cData = await cRes.json();
          email = cData.email || customerId;
          customerCache.set(customerId, email);
        } catch {
          email = customerId;
        }
      }

      const item = sub.items?.data?.[0];
      const listUnitAmount = (item?.price?.unit_amount || item?.plan?.amount || 0) / 100;
      const quantity = item?.quantity || 1;
      const listAmount = listUnitAmount * quantity;
      const priceId = item?.price?.id || "";
      const tier = priceId.includes("TwOty") || priceId.includes("TwCvM") ? "premier" : "pro";

      let effectiveAmount = listAmount;
      let discount: number | null = null;
      if (sub.latest_invoice) {
        try {
          const invRes = await fetch(
            `https://api.stripe.com/v1/invoices/${sub.latest_invoice}`,
            { headers: { Authorization: auth } },
          );
          const inv = await invRes.json();
          effectiveAmount = (inv.amount_paid || inv.total || 0) / 100;
          if (effectiveAmount < listAmount) {
            discount = Math.round((listAmount - effectiveAmount) * 100) / 100;
          }
        } catch { /* ignore */ }
      }

      customers.push({
        customerId,
        email,
        tier,
        listAmount: Math.round(listAmount * 100) / 100,
        effectiveAmount: Math.round(effectiveAmount * 100) / 100,
        discount,
        status: sub.status,
      });
    }

    return { customers };
  } catch (e) {
    console.error("subscriptions error:", e);
    return { customers: [], error: String(e) };
  }
});
