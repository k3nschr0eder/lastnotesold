/**
 * Stripe Integration — Server-Side
 *
 * Uses the owner's Stripe account for subscription billing.
 * Keys are set as STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY.
 */

import Stripe from "stripe";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2025-06-30.acacia" as any });
}

/** Price IDs configured in Stripe */
export const PRICES = {
  PRO_MONTHLY: "price_1TwOtrExpuSFJTtEH7NTOh0O",
  PREMIER_MONTHLY: "price_1TwOtyExpuSFJTtEmSxDgmmp",
} as const;

/** All recognized price IDs for tier detection (own + sibling LastSoldCoin) */
export const ALL_PRICE_IDS: {
  PRO: string[];
  PREMIER: string[];
} = {
  PRO: ["price_1TwOtrExpuSFJTtEH7NTOh0O", "price_1TwCf6ExpuSFJTtEDxfhjh9K"],
  PREMIER: ["price_1TwOtyExpuSFJTtEmSxDgmmp", "price_1TwCvMExpuSFJTtEyAWio9zL"],
};

/**
 * Create a Stripe Checkout session for subscribing.
 */
export async function createCheckoutSession(options: {
  tier: "pro" | "premier";
  customerEmail?: string;
  referralCode?: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const stripe = getStripe();
  const priceId = options.tier === "premier" ? PRICES.PREMIER_MONTHLY : PRICES.PRO_MONTHLY;

  return stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer_email: options.customerEmail,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: options.successUrl,
    cancel_url: options.cancelUrl,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    // Each shared referral link carries its own code — record it on the session
    // so the webhook can attribute the conversion to that specific code.
    metadata: options.referralCode ? { referral_code: options.referralCode } : undefined,
  });
}

/**
 * Create a Stripe Customer Portal session.
 */
export async function createPortalSession(customerId: string, returnUrl: string) {
  const stripe = getStripe();
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

/**
 * Verify a Stripe webhook signature.
 */
export function verifyWebhook(payload: string, signature: string) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET || "";
  return stripe.webhooks.constructEvent(payload, signature, secret);
}
