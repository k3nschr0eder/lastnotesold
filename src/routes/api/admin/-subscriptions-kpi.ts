/**
 * GET /api/admin/subscriptions-kpi — compute MRR, subscribers, churn from Stripe
 */

import { createServerFn } from "@tanstack/react-start";
import { getAdminSession } from "~/lib/admin-auth";

export const getAdminSubscriptionsKpi = createServerFn({ method: "GET" }).handler(async () => {
  const session = getAdminSession();
  if (!session) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { listMrr: 0, effectiveMrr: 0, activeSubscribers: 0, churnRate: 0 };

  const auth = "Basic " + Buffer.from(key + ":").toString("base64");

  try {
    let activeSubs: any[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const url =
        `https://api.stripe.com/v1/subscriptions?status=active&limit=100&expand[]=data.items.data.price.product` +
        (startingAfter ? `&starting_after=${startingAfter}` : "");
      const res = await fetch(url, { headers: { Authorization: auth } });
      const data = await res.json();
      activeSubs.push(...(data.data || []));
      hasMore = data.has_more;
      startingAfter = data.data?.length ? data.data[data.data.length - 1].id : undefined;
    }

    let listMrr = 0;
    let effectiveMrr = 0;
    for (const sub of activeSubs) {
      const item = sub.items?.data?.[0];
      if (item && item.price?.product?.name && item.price.product.name.toLowerCase().includes("lastnotesold")) {
        const unitAmount = item?.price?.unit_amount || item?.plan?.amount || 0;
        const quantity = item?.quantity || 1;
        listMrr += (unitAmount / 100) * quantity;

        if (sub.latest_invoice) {
          try {
            const invRes = await fetch(
              `https://api.stripe.com/v1/invoices/${sub.latest_invoice}`,
              { headers: { Authorization: auth } },
            );
            const inv = await invRes.json();
            effectiveMrr += (inv.amount_paid || inv.total || 0) / 100;
          } catch {
            effectiveMrr += (unitAmount / 100) * quantity;
          }
        } else {
          effectiveMrr += (unitAmount / 100) * quantity;
        }
      }
    }

    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 86400;
    let canceledCount = 0;
    hasMore = true;
    startingAfter = undefined;

    while (hasMore) {
      const url =
        `https://api.stripe.com/v1/subscriptions?status=canceled&limit=100&expand[]=data.items.data.price.product` +
        (startingAfter ? `&starting_after=${startingAfter}` : "");
      const res = await fetch(url, { headers: { Authorization: auth } });
      const data = await res.json();
      for (const sub of data.data || []) {
        const item = sub.items?.data?.[0];
        if (item && item.price?.product?.name && item.price.product.name.toLowerCase().includes("lastnotesold")) {
          if (sub.canceled_at && sub.canceled_at >= thirtyDaysAgo) canceledCount++;
        }
      }
      hasMore = data.has_more;
      startingAfter = data.data?.length ? data.data[data.data.length - 1].id : undefined;
    }

    const totalActive = activeSubs.length;
    const churnRate = totalActive > 0 ? canceledCount / totalActive : 0;

    return {
      listMrr: Math.round(listMrr * 100) / 100,
      effectiveMrr: Math.round(effectiveMrr * 100) / 100,
      activeSubscribers: totalActive,
      churnRate: Math.round(churnRate * 10000) / 100,
    };
  } catch (e) {
    console.error("subscriptions-kpi error:", e);
    return { listMrr: 0, effectiveMrr: 0, activeSubscribers: 0, churnRate: 0 };
  }
});
