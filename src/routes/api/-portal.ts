import { createServerFn } from "@tanstack/react-start";
import { createPortalSession } from "~/lib/stripe";

/**
 * Create a Stripe Customer Portal session for managing subscriptions.
 */
export const createPortal = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { customerId: string })
  .handler(async ({ data }) => {
    const origin = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const session = await createPortalSession(
      data.customerId,
      `${origin}/`,
    );

    return { url: session.url };
  });
