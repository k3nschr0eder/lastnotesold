import { Link } from "@tanstack/react-router";
import type { PriceResult } from "~/lib/pricing-engine";
import type { TabbedLookupResult } from "~/lib/api";
import TabbedResults from "~/components/TabbedResults";
import SingleSourceResults from "~/components/SingleSourceResults";

interface PricingResultsProps {
  result: PriceResult | TabbedLookupResult | null;
  soldCompsLoading?: boolean;
}

function isTabbedResult(r: PriceResult | TabbedLookupResult): r is TabbedLookupResult {
  return "ebay" in r || "greysheet" in r || "db" in r;
}

export default function PricingResults({ result, soldCompsLoading }: PricingResultsProps) {
  if (!result) return null;

  let tierBanner = null;
  if (isTabbedResult(result)) {
    const t = result as TabbedLookupResult;
    if (t.tier === "free" && t.freeLookupsRemaining !== undefined && t.freeLookupsRemaining <= 3) {
      tierBanner = (
        <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-5 py-3 text-center">
          <p className="text-sm text-emerald-400">
            {t.freeLookupsRemaining > 0
              ? `${t.freeLookupsRemaining} free lookup${t.freeLookupsRemaining !== 1 ? "s" : ""} remaining today. `
              : "You've used all your free lookups for today. "}
            <Link to="/pricing" className="font-bold underline underline-offset-2 hover:text-emerald-300">
              Upgrade to Pro or Premier
            </Link>
          </p>
        </div>
      );
    }
  }

  // Tabbed multi-source display
  if (isTabbedResult(result)) {
    return (
      <>
        {tierBanner}
        <TabbedResults result={result} tier={result.tier} soldCompsLoading={soldCompsLoading} />
      </>
    );
  }

  // Single PriceResult (legacy)
  return (
    <>
      {tierBanner}
      <SingleSourceResults result={result} />
    </>
  );
}