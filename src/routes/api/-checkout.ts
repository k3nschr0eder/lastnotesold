import { createServerFn } from "@tanstack/react-start";
import { createCheckoutSession } from "~/lib/stripe";

/**
 * Create a Stripe Checkout session for Pro/Premier subscription.
 * Returns the session URL to redirect the user to Stripe.
 * Mirrors the checkout.func heredoc in build-vercel.sh (including referral_code metadata).
 */
export const createCheckout = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { email?: string; tier?: string; referralCode?: string })
  .handler(async ({ data }) => {
    const origin = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const tier = (data.tier === "premier" ? "premier" : "pro") as "pro" | "premier";

    const session = await createCheckoutSession({
      tier,
      customerEmail: data.email,
      referralCode: data.referralCode,
      successUrl: `${origin}/?subscribed=true`,
      cancelUrl: `${origin}/pricing`,
    });

    return { url: session.url };
  });
