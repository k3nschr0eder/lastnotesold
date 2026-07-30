/**
 * LastNoteSold Tier Enforcement
 *
 * Determines which data sources and limits apply based on the user's subscription.
 * 
 * Free:    eBay Active only, 3 comps, 10 lookups/day
 * Pro:     eBay Active + Greysheet, 20 comps each, unlimited
 * Premier: All three, 20 comps each, unlimited
 */

import { dbQuery, dbExec } from "~/lib/db-tool";
import { ALL_PRICE_IDS } from "~/lib/stripe";

export type TierName = "free" | "pro" | "premier";

export interface TierConfig {
  tier: TierName;
  showEbay: boolean;
  showGreysheet: boolean;
  showSoldComps: boolean;
  maxComps: number;
  lookupsPerDay: number;
  lookupCount: number;
}

/** Default free tier config */
const FREE_TIER: TierConfig = {
  tier: "free",
  showEbay: true,
  showGreysheet: false,
  showSoldComps: false,
  maxComps: 3,
  lookupsPerDay: 10,
  lookupCount: 0,
};

// Simple in-memory counter for free lookups (per IP)
// In production, this is shared across function instances
// For MVP, it provides basic rate limiting
const freeCounters = new Map<string, { count: number; date: string }>();

/**
 * Track a free lookup and return the count for today.
 */
function trackFreeLookupByFingerprint(fp: string): number {
  const today = new Date().toISOString().substring(0, 10);
  const entry = freeCounters.get(fp);
  
  if (!entry || entry.date !== today) {
    freeCounters.set(fp, { count: 1, date: today });
    return 1;
  }
  
  entry.count++;
  freeCounters.set(fp, entry);
  return entry.count;
}

/**
 * Get the subscription tier for a Stripe Customer ID.
 * Checks Stripe API directly for active subscriptions.
 */
async function getTierForCustomer(customerId: string): Promise<TierConfig> {
  if (!customerId) return { ...FREE_TIER };

  try {
    const key = process.env.STRIPE_SECRET_KEY || "";
    if (!key) {
      console.error("[Tiers] STRIPE_SECRET_KEY is not set — tier detection will fail");
      return { ...FREE_TIER };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=active&limit=1&expand[]=data.items.data.price.product`,
      { headers: { Authorization: "Basic " + btoa(key + ":") }, signal: controller.signal },
    );
    clearTimeout(timer);
    const data = await res.json();
    const sub = data.data?.[0];
    
    if (!sub) return { ...FREE_TIER };

    // Filter: only recognize LastNoteSold subscriptions (not LastSoldCoin)
    const item = sub.items?.data?.[0];
    const productName: string = item?.price?.product?.name || "";
    if (!productName.toLowerCase().includes("lastnotesold")) {
      console.log(`[Tiers] Customer ${customerId}: non-LastNoteSold product "${productName}" — treating as free`);
      return { ...FREE_TIER };
    }

    const priceId: string = item?.price?.id;
    let tier: TierName;
    if (ALL_PRICE_IDS.PREMIER.includes(priceId)) {
      tier = "premier";
    } else if (ALL_PRICE_IDS.PRO.includes(priceId)) {
      tier = "pro";
    } else {
      // Unrecognized LastNoteSold price ID — default to pro
      tier = "pro";
    }

    const config = tier === "premier" ? {
      tier: "premier" as TierName,
      showEbay: true,
      showGreysheet: true,
      showSoldComps: true,
      maxComps: 20,
      lookupsPerDay: 0,
      lookupCount: 0,
    } : {
      tier: "pro" as TierName,
      showEbay: true,
      showGreysheet: true,
      showSoldComps: false,
      maxComps: 20,
      lookupsPerDay: 0,
      lookupCount: 0,
    };

    console.log(`[Tiers] Customer ${customerId}: ${tier}`);
    return config;
  } catch (e) {
    console.error("[Tiers] Stripe lookup failed:", e);
    return { ...FREE_TIER };
  }
}

/**
 * Get the full tier configuration for a request.
 */
export async function getTierConfig(options: {
  customerId?: string;
  fingerprint?: string;
}): Promise<TierConfig & { freeLookupsRemaining: number }> {
  const fp = options.fingerprint || "anon";
  
  // Check if fingerprint looks like a Stripe customer ID (cus_...)
  if (fp.startsWith("cus_")) {
    return { ...(await getTierForCustomer(fp)), freeLookupsRemaining: -1 };
  }

  if (options.customerId) {
    return { ...(await getTierForCustomer(options.customerId)), freeLookupsRemaining: -1 };
  }

  // Free user — track lookup by IP/fingerprint
  const count = trackFreeLookupByFingerprint(fp);

  return {
    ...FREE_TIER,
    lookupCount: count,
    freeLookupsRemaining: Math.max(0, FREE_TIER.lookupsPerDay - count),
  };
}
