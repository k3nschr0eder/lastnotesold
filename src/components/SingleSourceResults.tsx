import type { PriceResult } from "~/lib/pricing-engine";

interface SingleSourceResultsProps {
  result: PriceResult;
}

/** The only grades we show for Greensheet CPG (Paper Money scale) */
const CPG_GRADES = [
  "VG8", "F15", "VF30", "XF45", "AU55",
  "AU58", "CU60", "CU63", "CU64", "GEM65",
  "GEM66", "GEM67", "GEM68", "GEM69", "GEM70",
];

/** Normalize a grade string from the API to match our CPG_GRADES.
 *  Handles formats like "AG-3", "AG 3", "AG3", "MS-65", "MS 65", "MS65" */
function normalizeGrade(grade: string): string {
  return grade.replace(/[\s\-_]/g, "").toUpperCase();
}

const LOW_GRADES = CPG_GRADES.slice(0, 5);   // VG8 → AU55
const MID_GRADES = CPG_GRADES.slice(5, 10);  // AU58 → GEM65
const HIGH_GRADES = CPG_GRADES.slice(10);     // GEM66 → GEM70

/** Return a color class for the source badge */
function sourceBadgeInfo(result: PriceResult): { label: string; color: string; icon: string } {
  const s = result.source?.toLowerCase() || "";
  if (s.includes("sold") || s.includes("sold-comps")) {
    return { label: "eBay Sold Listings", color: "bg-green-900/60 text-green-300 border-green-700/50", icon: "💵" };
  }
  if (s.includes("greensheet") || s.includes("cpg") || s.includes("retail")) {
    return { label: "Greensheet CPG", color: "bg-emerald-900/60 text-emerald-300 border-emerald-700/50", icon: "🏦" };
  }
  if (s.includes("ebay") || s.includes("active listing")) {
    return { label: "eBay Active Listings", color: "bg-blue-900/60 text-blue-300 border-blue-700/50", icon: "🛒" };
  }
  if (s.includes("historical") || s.includes("auction") || s.includes("database")) {
    return { label: "Historical Auction Data", color: "bg-emerald-900/60 text-emerald-300 border-emerald-700/50", icon: "🏛️" };
  }
  return { label: "Price Data", color: "bg-gray-700 text-gray-200", icon: "📊" };
}

/** Determine the copy for the headline price area based on source */
function priceHeadline(result: PriceResult, hasData: boolean): string {
  if (!hasData) return "No Comps Found";
  const s = result.source?.toLowerCase() || "";
  if (s.includes("greensheet") || s.includes("cpg") || s.includes("retail")) return "Greensheet CPG";
  if (s.includes("sold") || s.includes("sold-comps")) return "Avg. Sold Price (eBay Listings)";
  if (s.includes("ebay") || s.includes("active")) return "Avg. Asking Price (Active Listings)";
  if (s.includes("historical") || s.includes("auction") || s.includes("database")) return "Average Last Sold Price";
  return "Average Price";
}

/** Build a normalized grade→retail map from sales.
 *  Uses CPG retail prices when available, falls back to Greensheet retail prices. */
function buildGradeRetailMap(sales: PriceResult["recent_sales"]): Map<string, number> {
  const map = new Map<string, number>();
  // First pass: collect CPG retail prices (preferred)
  for (const sale of sales) {
    const source = sale.source?.toLowerCase() || "";
    if (source.includes("cpg")) {
      const norm = normalizeGrade(sale.grade);
      // Only set if not already set (first CPG price wins)
      if (!map.has(norm)) {
        map.set(norm, sale.price);
      }
    }
  }
  // Second pass: fill in missing grades from Greensheet retail prices
  // (these are the best available proxy when no CPG retail exists)
  for (const sale of sales) {
    const source = sale.source?.toLowerCase() || "";
    const norm = normalizeGrade(sale.grade);
    if (!map.has(norm) && (source.includes("greensheet") || source.includes("cpg"))) {
      map.set(norm, sale.price);
    }
  }
  return map;
}

/** Average of retail prices for grades in the given list that have data. Returns null if none. */
function averageForGrades(gradeMap: Map<string, number>, gradeList: string[]): number | null {
  let sum = 0;
  let count = 0;
  for (const grade of gradeList) {
    const norm = normalizeGrade(grade);
    const price = gradeMap.get(norm);
    if (price !== undefined && price > 0) {
      sum += price;
      count++;
    }
  }
  if (count === 0) return null;
  return Math.round((sum / count) * 100) / 100;
}

export default function SingleSourceResults({ result }: SingleSourceResultsProps) {
  const hasData = result.comps_count > 0;
  const badge = sourceBadgeInfo(result);
  const headlineLabel = priceHeadline(result, hasData);

  const isGreensheet = result.source?.toLowerCase().includes("greensheet");

  // Greensheet: build grade→retail map and filter to CPG_GRADES
  const gradeRetailMap = hasData && isGreensheet ? buildGradeRetailMap(result.recent_sales) : null;
  const greysheetRows = gradeRetailMap
    ? CPG_GRADES
        .map(grade => ({ grade, retail: gradeRetailMap.get(normalizeGrade(grade)) ?? 0 }))
        .filter(row => row.retail > 0)
    : null;

  // Greensheet: three grade-based averages
  const lowAvg = gradeRetailMap ? averageForGrades(gradeRetailMap, LOW_GRADES) : null;
  const midAvg = gradeRetailMap ? averageForGrades(gradeRetailMap, MID_GRADES) : null;
  const highAvg = gradeRetailMap ? averageForGrades(gradeRetailMap, HIGH_GRADES) : null;

  // Greensheet headline: average of the three grade-tier averages
  const tierAvgs = [lowAvg, midAvg, highAvg].filter((v): v is number => v !== null);
  const greysheetAvg = tierAvgs.length > 0
    ? Math.round((tierAvgs.reduce((s, v) => s + v, 0) / tierAvgs.length) * 100) / 100
    : null;

  return (
    <div className="animate-fade-in">
      {/* Source badge */}
      <div className="mb-4 flex justify-center">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs font-semibold ${badge.color}`}>
          <span>{badge.icon}</span>
          {badge.label}
        </span>
      </div>

      {/* ── Greensheet: just the three grade-tier averages (no headline price) ── */}
      {hasData && isGreensheet && (
        <div className="mb-8 grid gap-3 sm:gap-6 grid-cols-1 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-800 bg-gray-900/80 p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Low Grade Avg</p>
            <p className="mt-1 text-2xl font-bold text-gray-200">
              {lowAvg !== null ? `$${lowAvg.toLocaleString()}` : "\u2014"}
            </p>
            <p className="text-xs text-gray-500">VG8 - AU55</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900/80 p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Mid-Grade Avg</p>
            <p className="mt-1 text-2xl font-bold text-gray-200">
              {midAvg !== null ? `$${midAvg.toLocaleString()}` : "\u2014"}
            </p>
            <p className="text-xs text-gray-500">AU58 - GEM65</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900/80 p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">High Grade Avg</p>
            <p className="mt-1 text-2xl font-bold text-gray-200">
              {highAvg !== null ? `$${highAvg.toLocaleString()}` : "\u2014"}
            </p>
            <p className="text-xs text-gray-500">GEM66 - GEM70</p>
          </div>
        </div>
      )}

      {/* ── eBay / Historical: Big Price Card with headline ── */}
      {!isGreensheet && (
        <div className="mb-8 overflow-hidden rounded-2xl border border-emerald-800/30 bg-gradient-to-br from-gray-900 via-gray-900 to-emerald-950/30 shadow-2xl shadow-emerald-900/20">
          <div className="grid gap-4 sm:gap-6 p-4 sm:p-8 grid-cols-1 sm:grid-cols-3">
            <div className="text-center sm:col-span-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-500">
                {headlineLabel}
              </p>
              <p className="text-4xl font-extrabold tracking-tight text-emerald-400 sm:text-6xl">
                {hasData ? `$${result.avg_price.toLocaleString()}` : "\u2014"}
              </p>
              {hasData && (
                <p className="mt-2 text-sm text-gray-500">{result.summary}</p>
              )}
              {!hasData && (
                <p className="mt-4 text-sm text-gray-500">
                  Try a broader search \u2014 e.g. just the note name without grade
                </p>
              )}
            </div>

            {/* Non-Greensheet: show Low/Median/High */}
            {hasData && (
              <>
                <div className="rounded-xl border border-gray-800 bg-gray-900/80 p-4 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Low</p>
                  <p className="mt-1 text-2xl font-bold text-gray-200">${result.range.low.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-gray-800 bg-gray-900/80 p-4 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Median</p>
                  <p className="mt-1 text-2xl font-bold text-gray-200">${result.median_price.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-gray-800 bg-gray-900/80 p-4 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">High</p>
                  <p className="mt-1 text-2xl font-bold text-gray-200">${result.range.high.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">across {result.comps_count} comps</p>
                </div>
              </>
            )}
          </div>

          {/* Source note */}
          {result.note && hasData && (
            <div className="border-t border-emerald-900/20 px-8 py-3 text-center">
              <p className="text-xs text-gray-500 italic">{result.note}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Greensheet: Grade-by-grade breakdown (Retail only) ── */}
      {greysheetRows && greysheetRows.length > 0 && (
        <div className="mb-8">
          <h3 className="mb-4 text-lg font-bold text-white">
            CPG Retail by Grade
          </h3>
          <div className="overflow-hidden rounded-xl border border-gray-800">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/80">
                    <th className="px-5 py-4 font-semibold text-gray-400">Grade</th>
                    <th className="px-5 py-4 font-semibold text-gray-400">Retail (CPG)</th>
                  </tr>
                </thead>
                <tbody>
                  {greysheetRows.map((row, i) => (
                    <tr
                      key={row.grade}
                      className={`border-b border-gray-800/50 transition-colors hover:bg-gray-800/40 ${
                        i % 2 === 0 ? "bg-gray-900/30" : "bg-gray-950/30"
                      }`}
                    >
                      <td className="px-5 py-4">
                        <span className="rounded-md bg-emerald-900/30 px-2.5 py-1 text-xs font-semibold text-emerald-400">
                          {row.grade}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-bold text-emerald-400">
                        ${row.retail.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Recent Comps Table (non-Greensheet) ── */}
      {hasData && result.recent_sales.length > 0 && !isGreensheet && (
        <div>
          <h3 className="mb-4 text-lg font-bold text-white">
            {result.source?.toLowerCase().includes("sold")
              ? "Recent Sold Listings"
              : result.source?.toLowerCase().includes("ebay")
              ? "Active eBay Listings"
              : "Recent Sales"}
          </h3>
          <div className="overflow-hidden rounded-xl border border-gray-800">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/80">
                    <th className="px-5 py-4 font-semibold text-gray-400">Date</th>
                    <th className="px-5 py-4 font-semibold text-gray-400">Grade</th>
                    <th className="px-5 py-4 font-semibold text-gray-400">
                      {result.source?.toLowerCase().includes("sold") ? "Sold Price" : result.source?.toLowerCase().includes("ebay") ? "Asking Price" : "Price"}
                    </th>
                    <th className="px-5 py-4 font-semibold text-gray-400">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {result.recent_sales.map((sale, i) => {
                    const displayDate = sale.sale_date.length > 10
                      ? sale.sale_date.substring(0, 10)
                      : sale.sale_date;
                    return (
                    <tr
                      key={sale.id}
                      className={`border-b border-gray-800/50 transition-colors hover:bg-gray-800/40 ${
                        i % 2 === 0 ? "bg-gray-900/30" : "bg-gray-950/30"
                      }`}
                    >
                      <td className="px-5 py-4 text-gray-300">{displayDate}</td>
                      <td className="px-5 py-4">
                        <span className="rounded-md bg-emerald-900/30 px-2.5 py-1 text-xs font-semibold text-emerald-400">
                          {sale.grade}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-bold text-white">
                        ${sale.price.toLocaleString()}
                      </td>
                      <td className="px-5 py-4">
                        {sale.sale_url ? (
                          <a
                            href={sale.sale_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition-colors text-xs font-medium"
                          >
                            {sale.auction_house}
                            <svg className="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        ) : (
                          <span className="text-gray-400 text-xs font-medium">{sale.auction_house}</span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}