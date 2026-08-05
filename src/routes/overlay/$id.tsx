import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getOverlay } from "~/routes/api/-overlays";
import { lookupNote } from "~/lib/api";
import type { TabbedLookupResult } from "~/lib/api";
import type { PriceResult } from "~/lib/pricing-engine";
import type { OverlayRow } from "~/lib/overlays";

export const Route = createFileRoute("/overlay/$id")({
  component: OverlayViewer,
});

/** Auto-refresh interval for live pricing (ms). */
const REFRESH_MS = 30_000;

const REFRESH_HINT: Record<string, string> = {
  "eBay Sold Listings": "eBay sold",
  "Greensheet CPG": "Greensheet",
  "eBay Active Listings": "eBay asking",
  "Historical Auction Data": "auction data",
};

function formatMoney(v: number): string {
  if (!v || Number.isNaN(v)) return "—";
  return "$" + v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function OverlayViewer() {
  const { id: token } = Route.useParams();
  const [overlay, setOverlay] = useState<OverlayRow | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [result, setResult] = useState<TabbedLookupResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Resolve the overlay by its unguessable token.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getOverlay({ data: { token } })
      .then((res) => {
        if (cancelled) return;
        if (res?.overlay) {
          setOverlay(res.overlay);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Look up pricing immediately and then auto-refresh every 30s.
  useEffect(() => {
    if (!overlay) return;
    let cancelled = false;

    const run = async () => {
      try {
        const r = (await lookupNote({
          data: { query: overlay.query, fingerprint: overlay.customerId },
        })) as TabbedLookupResult;
        if (!cancelled) {
          setResult(r);
          setLastUpdated(new Date());
        }
      } catch {
        // Keep showing the last good result on transient failures.
      }
    };

    run();
    const interval = setInterval(run, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [overlay]);

  // Pick the best data source: real sold prices > dealer pricing > asking > fallback.
  const primary: PriceResult | null =
    result?.soldcomps || result?.greysheet || result?.ebay || result?.db || null;
  const displayPrice = primary ? (primary.avg_price > 0 ? primary.avg_price : primary.median_price) : 0;
  const hasRange = !!primary && primary.range?.low > 0 && primary.range?.high > 0;
  const sourceLabel = primary?.source || "";

  const now = new Date();
  const today = now.toISOString().substring(0, 10);
  const updatedLabel = lastUpdated
    ? (lastUpdated.toISOString().substring(0, 10) === today
        ? "Updated " +
          lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        : "Updated " + lastUpdated.toLocaleDateString() + " " +
          lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
    : "";

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-6 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        <p className="mt-4 text-sm text-gray-400">Loading overlay…</p>
      </div>
    );
  }

  if (notFound || !overlay) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-6 text-center">
        <p className="text-5xl mb-4">🔍</p>
        <h1 className="text-xl font-bold text-white sm:text-2xl">Overlay not found</h1>
        <p className="mt-2 max-w-sm text-sm text-gray-400">
          This overlay may have been deleted. Create a new one from the Overlays page.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-8 py-10 text-center">
      <div className="w-full max-w-3xl">
        {/* Query heading */}
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-100 sm:text-4xl">
          {overlay.query}
        </h1>

        {/* Big price */}
        {displayPrice > 0 ? (
          <p className="mt-4 text-6xl font-black tracking-tight text-emerald-400 sm:text-8xl">
            {formatMoney(displayPrice)}
          </p>
        ) : (
          <p className="mt-6 text-3xl font-bold text-gray-500 sm:text-5xl">
            No price found
          </p>
        )}

        {/* Range + source line */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-gray-300 sm:text-base">
          {hasRange && (
            <span className="font-semibold">
              {formatMoney(primary!.range.low)} – {formatMoney(primary!.range.high)}
            </span>
          )}
          {primary && primary.comps_count > 0 && (
            <span className="text-gray-400">
              {primary.comps_count} {primary.comps_count === 1 ? "comp" : "comps"}
            </span>
          )}
          {sourceLabel && (
            <span className="rounded-full border border-emerald-900/50 bg-emerald-950/40 px-3 py-0.5 text-xs font-semibold text-emerald-400">
              {REFRESH_HINT[sourceLabel] || sourceLabel}
            </span>
          )}
        </div>

        {result?.error && !primary && (
          <p className="mt-4 text-xs text-gray-500">{result.error}</p>
        )}

        {updatedLabel && (
          <p className="mt-6 text-[10px] uppercase tracking-widest text-gray-600">
            {updatedLabel} · refreshes every 30s
          </p>
        )}
      </div>
    </div>
  );
}
