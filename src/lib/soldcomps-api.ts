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
    console.error("[SoldComps] SOLDCOMPS_API_TOKEN not configured — cannot fetch sold data");
    return [];
  }
  console.log(`[SoldComps] Starting fetch for "${query}" (token present: ${token.length} chars)`);

  const params = new URLSearchParams({
    keyword: query,
    count: String(Math.min(count, 240)),
  });

  // Internal timeout — the caller (api.ts) adds a 20s outer deadline via withDeadline,
  // so this AbortSignal acts as a safety net for stalled connections.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error("SoldComps fetch timed out")), 25000);

  const startTime = Date.now();
  try {
    const resp = await fetch(`${API_BASE}/scrape?${params.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    const elapsed = Date.now() - startTime;
    if (!resp.ok) {
      console.error(`[SoldComps] HTTP ${resp.status} after ${elapsed}ms — token may have expired or be rate-limited`);
      return [];
    }

    const data: SoldCompsResponse = await resp.json();
    console.log(`[SoldComps] Found ${data.items.length} sold listings for "${query}" in ${elapsed}ms`);
    return data.items;
  } catch (e) {
    const elapsed = Date.now() - startTime;
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("timed out") || msg.includes("abort") || msg.includes("AbortError")) {
      console.error(`[SoldComps] Request timed out for "${query}" after ${elapsed}ms — API may be slow or unreachable`);
    } else {
      console.error(`[SoldComps] Error for "${query}" after ${elapsed}ms:`, msg);
    }
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}
