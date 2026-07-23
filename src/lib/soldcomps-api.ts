/**
 * Sold-Comps API Integration
 *
 * Uses the Sold-Comps.com API to fetch real eBay sold prices.
 *   Endpoint: GET https://api.sold-comps.com/v1/scrape
 *   Auth:     Bearer token (sc_...)
 *
 * @see https://sold-comps.com/docs
 */

export interface SoldCompsItem {
  itemId: string;
  title: string;
  url: string;
  thumbnailUrl?: string;
  condition: string;
  soldPrice: number;
  soldCurrency: string;
  shippingPrice?: number;
  totalPrice?: number;
  endedAt: string;
  sellerUsername?: string;
  sellerType?: string;
  bidCount?: number;
  bestOfferAccepted?: boolean;
  buyingFormat?: string;
  itemLocation?: string;
  scrapedAt?: string;
}

interface SoldCompsResponse {
  keyword: string;
  page: number;
  totalItems: number;
  hasNextPage: boolean;
  autoSelectedCategory: string | null;
  items: SoldCompsItem[];
}

// ─── Configuration ──────────────────────────────────────────────────────

const API_BASE = "https://api.sold-comps.com/v1";

function getApiToken(): string {
  return process.env.SOLDCOMPS_API_TOKEN || "";
}

export function hasCredentials(): boolean {
  return !!getApiToken();
}

// ─── Search Function ────────────────────────────────────────────────────

/**
 * Search Sold-Comps for completed eBay sales.
 * Returns up to `count` sold listings (max 240 per request).
 */
export async function searchSoldComps(
  query: string,
  count: number = 20,
): Promise<SoldCompsItem[]> {
  const token = getApiToken();
  if (!token) {
    console.log("[SoldComps] SOLDCOMPS_API_TOKEN not configured");
    return [];
  }

  const params = new URLSearchParams({
    keyword: query,
    count: String(Math.min(count, 240)),
  });

  // Shorter internal timeout — the caller (api.ts) adds a 12s outer deadline,
  // so this AbortSignal catches cases where the fetch stalls before the caller's timeout.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error("SoldComps fetch timed out")), 18000);

  try {
    const resp = await fetch(`${API_BASE}/scrape?${params.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!resp.ok) {
      console.log(`[SoldComps] HTTP ${resp.status} — token may have expired or be rate-limited`);
      return [];
    }

    const data: SoldCompsResponse = await resp.json();
    console.log(`[SoldComps] Found ${data.items.length} sold listings for "${query}"`);
    return data.items;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("timed out") || msg.includes("abort") || msg.includes("AbortError")) {
      console.warn(`[SoldComps] Request timed out for "${query}" — API may be slow to scrape eBay`);
    } else {
      console.error(`[SoldComps] Error for "${query}":`, msg);
    }
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}
