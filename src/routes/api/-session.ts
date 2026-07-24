import { createServerFn } from "@tanstack/react-start";

/**
 * GET /api/session — Look up Stripe customer by session_id or email.
 *
 *   ?session_id=cs_xxx  → retrieves checkout session, returns { customerId }
 *   ?email=user@ex.com  → searches Stripe customers, returns { customerId } if found
 *
 * Used by the post-checkout flow to resolve a customer ID for the referral widget.
 */

async function fetchStripe(path: string): Promise<any> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");

  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: {
      Authorization: "Basic " + Buffer.from(key + ":").toString("base64"),
    },
  });
  return res.json();
}

export const getSession = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { session_id?: string; email?: string })
  .handler(async ({ data }) => {
    try {
      // Lookup by session_id
      if (data.session_id) {
        const session = await fetchStripe(`checkout/sessions/${data.session_id}`);
        return {
          customerId: session.customer || null,
          subscriptionId: session.subscription || null,
        };
      }

      // Lookup by email
      if (data.email) {
        const result = await fetchStripe(
          `customers/search?query=email:'${encodeURIComponent(data.email)}'&limit=1`
        );
        const customer = result.data?.[0];
        return { customerId: customer?.id || null };
      }

      return { error: "Missing session_id or email" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { error: msg };
    }
  });
