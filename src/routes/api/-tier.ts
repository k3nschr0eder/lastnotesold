import { createServerFn } from "@tanstack/react-start";
import { getTierConfig } from "~/lib/tiers";

export const getTier = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { customerId?: string; fingerprint?: string })
  .handler(async ({ data }) => {
    const config = await getTierConfig({
      customerId: data.customerId,
      fingerprint: data.fingerprint,
    });

    return {
      tier: config.tier,
      freeLookupsRemaining: config.freeLookupsRemaining,
      showEbay: config.showEbay,
      showGreysheet: config.showGreysheet,
      showSoldComps: config.showSoldComps,
    };
  });
