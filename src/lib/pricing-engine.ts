/**
 * LastNoteSold Engine
 *
 * Core pricing calculation logic. Given matching sales records, computes:
 * - Average price
 * - Median price
 * - High/low range
 * - Number of comps (comparable sales)
 * - Recent sales list
 *
 * Supports filtering by grade and certification tier.
 */

export interface SaleRecord {
  id: number;
  note_id: number;
  source: string;
  sale_date: string;
  price: number;
  grade: string;
  auction_house: string;
  certification?: string;
  sale_url?: string;
}

export interface PriceResult {
  query: string;
  avg_price: number;
  median_price: number;
  range: { low: number; high: number };
  comps_count: number;
  recent_sales: SaleRecord[];
  grade?: string;
  certification?: string;
  /**
   * A short textual summary for quick display during a live stream.
   */
  summary: string;
  /** Data source label: "Greysheet CPG", "eBay Active Listings", "Historical Auction Data" */
  source?: string;
  /** Additional context about the data source */
  note?: string;
}

/**
 * Compute the median of a sorted number array.
 */
function median(sortedPrices: number[]): number {
  if (sortedPrices.length === 0) return 0;
  const mid = Math.floor(sortedPrices.length / 2);
  if (sortedPrices.length % 2 === 0) {
    return (sortedPrices[mid - 1] + sortedPrices[mid]) / 2;
  }
  return sortedPrices[mid];
}

/**
 * Compute pricing stats from a list of sale records.
 * Sales are sorted by date descending (most recent first).
 */
export function computePricing(
  rawQuery: string,
  sales: SaleRecord[],
  options?: { grade?: string; certification?: string; skipTrim?: boolean; maxRecentSales?: number },
): PriceResult {
  let filtered = [...sales];

  if (options?.grade) {
    const g = options.grade.toLowerCase();
    filtered = filtered.filter(
      (s) => s.grade && s.grade.toLowerCase().includes(g),
    );
  }

  if (options?.certification) {
    const c = options.certification.toLowerCase();
    filtered = filtered.filter(
      (s) =>
        s.certification && s.certification.toLowerCase().includes(c),
    );
  }

  // Sort by date descending (most recent first)
  filtered.sort(
    (a, b) => new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime(),
  );

  const prices = filtered.map((s) => s.price).filter((p) => typeof p === "number" && !Number.isNaN(p));
  const count = prices.length;

  if (count === 0) {
    return {
      query: rawQuery,
      avg_price: 0,
      median_price: 0,
      range: { low: 0, high: 0 },
      comps_count: 0,
      recent_sales: [],
      grade: options?.grade,
      certification: options?.certification,
      summary: `No comps found for "${rawQuery}".`,
    };
  }

  prices.sort((a, b) => a - b);

  // Trimmed average: exclude the 2 highest and 2 lowest prices
  // to get a more representative median price for live-stream comps.
  // Skip trimming for curated data sources like Greysheet CPG.
  const trimCount = options?.skipTrim ? 0 : Math.min(2, Math.floor(prices.length / 2));
  const trimmedPrices = trimCount > 0
    ? prices.slice(trimCount, prices.length - trimCount)
    : prices;
  const trimmedCount = trimmedPrices.length;

  const avg = trimmedCount > 0
    ? Math.round((trimmedPrices.reduce((s, p) => s + p, 0) / trimmedCount) * 100) / 100
    : Math.round((prices.reduce((s, p) => s + p, 0) / count) * 100) / 100;

  const med = Math.round(median(trimmedPrices.length > 0 ? trimmedPrices : prices) * 100) / 100;
  const low = Math.round(prices[0] * 100) / 100;
  const high = Math.round(prices[prices.length - 1] * 100) / 100;

  const trimmedLabel = trimCount > 0
    ? ` (trimmed ${trimCount} hi/lo)`
    : "";
  const summary = `${count} comp${count !== 1 ? "s" : ""} · Avg $${avg.toLocaleString()}${trimmedLabel} · Range $${low.toLocaleString()}–$${high.toLocaleString()}`;

  return {
    query: rawQuery,
    avg_price: avg,
    median_price: med,
    range: { low, high },
    comps_count: count,
    recent_sales: filtered.slice(0, options?.maxRecentSales ?? 10),
    grade: options?.grade,
    certification: options?.certification,
    summary,
  };
}