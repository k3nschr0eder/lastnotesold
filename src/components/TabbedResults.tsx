import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { PriceResult } from "~/lib/pricing-engine";
import type { TabbedLookupResult } from "~/lib/api";
import type { TierName } from "~/lib/tiers";
import SingleSourceResults from "~/components/SingleSourceResults";

interface TabbedResultsProps {
  result: TabbedLookupResult;
  tier?: TierName;
}

interface SourceTab {
  id: string;
  label: string;
  data: PriceResult | null;
  icon: string;
}

function tabColor(id: string, isActive: boolean): string {
  if (!isActive) return "bg-gray-800/60 text-gray-400 hover:text-gray-200 border-gray-700";
  switch (id) {
    case "ebay": return "bg-blue-900/60 text-blue-300 border-blue-500";
    case "greysheet": return "bg-emerald-900/60 text-emerald-300 border-emerald-500";
    case "soldcomps": return "bg-green-900/60 text-green-300 border-green-500";
    default: return "bg-gray-800 text-gray-200 border-gray-500";
  }
}

/** Placeholder card shown when a data source has null data.
 *  eBay null = no results.
 *  Greysheet null = upgrade prompt for free tier, "data unavailable" for pro/premier.
 *  SoldComps null = upgrade prompt for free/pro, "data unavailable" for premier. */
function PlaceholderCard({ tabId, tier }: { tabId: string; tier?: TierName }) {
  if (tabId === "ebay") {
    return (
      <div className="mx-auto w-full max-w-4xl animate-fade-in text-center">
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-12">
          <p className="text-4xl mb-4">🔍</p>
          <p className="text-gray-400">Try a broader search — e.g. just the note name without grade</p>
        </div>
      </div>
    );
  }

  // Determine if the user is entitled to this data source
  let isEntitled = false;
  if (tabId === "greysheet" && tier && (tier === "pro" || tier === "premier")) {
    isEntitled = true;
  }
  if (tabId === "soldcomps" && tier === "premier") {
    isEntitled = true;
  }

  // User has the right tier but data is unavailable (API error, timeout, etc.)
  if (isEntitled) {
    const message =
      tabId === "greysheet"
        ? "Greensheet CPG data is currently unavailable. This may be a temporary issue — please try again or contact support."
        : "Sold Comps data is currently unavailable. This may be a temporary issue — please try again or contact support.";

    return (
      <div className="mx-auto w-full max-w-4xl animate-fade-in text-center">
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-12">
          <p className="text-4xl mb-4">{tabId === "greysheet" ? "🏦" : "💵"}</p>
          <h3 className="text-xl font-bold text-white mb-2">
            {tabId === "greysheet" ? "Greensheet CPG" : "Sold Comps"}
          </h3>
          <p className="text-gray-400 text-sm max-w-md mx-auto">{message}</p>
        </div>
      </div>
    );
  }

  // User doesn't have this tier — show upgrade prompt
  const config =
    tabId === "greysheet"
      ? {
          title: "Greensheet CPG",
          icon: "🏦",
          message:
            "Greensheet CPG data requires a Pro or Premier subscription. Upgrade to see wholesale and retail pricing by grade.",
        }
      : {
          title: "Sold Comps",
          icon: "💵",
          message:
            "Sold Comps data requires a Premier subscription. Upgrade to see real eBay sold transaction prices.",
        };

  return (
    <div className="mx-auto w-full max-w-4xl animate-fade-in">
      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-12 text-center">
        <p className="text-4xl mb-4">{config.icon}</p>
        <h3 className="text-xl font-bold text-white mb-2">{config.title}</h3>
        <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">{config.message}</p>
        <Link
          to="/pricing"
          className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
        >
          View Plans
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

export default function TabbedResults({ result, tier }: TabbedResultsProps) {
  const tabs: SourceTab[] = [
    { id: "ebay", label: "eBay Active", data: result.ebay, icon: "🛒" },
    { id: "greysheet", label: "Greensheet CPG", data: result.greysheet, icon: "🏦" },
    { id: "soldcomps", label: "Sold Comps", data: result.soldcomps, icon: "💵" },
  ];

  // Default to eBay; if eBay is null (shouldn't happen), pick first tab with data
  const defaultTab = result.ebay ? "ebay" : (tabs.find((t) => t.data !== null)?.id || "ebay");
  const [activeTab, setActiveTab] = useState(defaultTab);
  const activeSource = tabs.find((t) => t.id === activeTab) || tabs[0];

  // Extract query from any tab that has data
  const query = result.ebay?.query || result.greysheet?.query || result.soldcomps?.query || "";

  // Global error with no data at all
  if (result.error && tabs.every((t) => t.data === null)) {
    return (
      <div className="mx-auto w-full max-w-4xl animate-fade-in text-center">
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-12">
          <p className="text-4xl mb-4">🔍</p>
          <p className="text-red-400 text-sm">{result.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl animate-fade-in">
      {/* Results for query */}
      {query && (
        <p className="mb-6 text-center text-sm text-gray-400">
          Results for{" "}
          <span className="font-semibold text-emerald-400">{query}</span>
        </p>
      )}

      {/* Tabs — always show all three */}
      <div className="mb-6 flex items-center justify-center gap-2 overflow-x-auto pb-1 whitespace-nowrap">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
              tabColor(tab.id, activeTab === tab.id)
            } ${activeTab === tab.id ? "shadow-lg" : "opacity-75 hover:opacity-100"}`}
          >
            <span>{tab.icon}</span>
            {tab.label}
            {tab.data && tab.data.comps_count > 0 && (
              <span className="ml-0.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">
                {tab.data.comps_count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Active source content — null guard: never pass null to SingleSourceResults */}
      {activeSource.data ? (
        <SingleSourceResults result={activeSource.data} />
      ) : (
        <PlaceholderCard tabId={activeSource.id} tier={tier} />
      )}
    </div>
  );
}
