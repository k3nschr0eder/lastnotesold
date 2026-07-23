/**
 * eBay API Integration — Production
 * 
 * Uses the eBay Buy API (Browse) to search real sold/listed items.
 * OAuth2 client_credentials flow with production keys.
 */
import { Buffer } from "node:buffer";

// NOTE: This client ID is shared with the LastCoinSold eBay developer app registration.
// A separate eBay developer app may be needed for LastNoteSold in the future.
const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID || "";
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET || "";
const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const BROWSE_API = "https://api.ebay.com/buy/browse/v1/item_summary/search";

let cachedToken: { token: string; expires: number } | null = null;

/**
 * Detect if an eBay listing title indicates a bulk lot or multi-item listing
 * that wouldn't represent a single-note price.
 */
function isBulkOrMultiItemLot(title: string): boolean {
  const t = title.toLowerCase();

  // Patterns that strongly indicate a multi-note listing
  const multiItemPatterns = [
    /\blot\b/,           // "lot", "lots" — bulk lot, mixed lot
    /\bgroup\b/,         // "group of"
    /\bhoard\b/,         // "hoard"
    /\baccumulation\b/,  // "accumulation"
    /\bbundle\b/,        // "bundle"
    /\bbulk\b/,          // "bulk"
    /\bmix(ed)?\b/,      // "mix" or "mixed"
    /\bcollection\b/,    // "collection of"
    /\beach\b/,          // "$5 each" — per-unit pricing
    /\bper lot\b/,       // "per lot"
    /\bfor lot\b/,       // "for lot"
    /\b[a-z]+\s+lot\b/,  // "note lot", "currency lot", etc.
  ];

  for (const pattern of multiItemPatterns) {
    if (pattern.test(t)) return true;
  }

  // Date range like "1880-1909" or "1880–1909" indicates multiple years
  if (/\b(18|19|20)\d{2}\s*[-–]\s*(18|19|20)\d{2}\b/.test(t)) return true;

  // "x" multiplier pattern like "10x", "5 notes", "2 pc", "3 pcs"
  if (/\b\d+\s*x\s*\b/i.test(t)) return true;
  if (/\b\d+\s+(notes?|pcs?|pieces?|items?)\b/i.test(t)) return true;

  // "set" in a numismatic context (note set, mint set, proof set, etc.)
  if (/\b(set|series)\s+(of\s+)?\d+\b/i.test(t)) return true;
  if (/\b(proof|mint|uncirculated)\s+set\b/i.test(t)) return true;

  return false;
}

/**
 * Extract the primary year from a search query (e.g. "1909 Indian Head Cent" → 1909).
 */
export function extractSearchYear(query: string): number | null {
  const match = query.match(/\b(18|19|20)\d{2}\b/);
  return match ? parseInt(match[0], 10) : null;
}

/**
 * Check if a listing title matches the specific note being searched.
 * Filters out listings that mention years other than the searched year.
 */
function isSpecificToSearch(title: string, searchYear: number | null): boolean {
  if (!searchYear) return true; // no year to match against

  const t = title.toLowerCase();

  // Extract all years mentioned in the title
  const years = [...t.matchAll(/\b(18|19|20)\d{2}\b/g)].map(m => parseInt(m[0], 10));

  // If no years in title, we can't verify — pass it through
  if (years.length === 0) return true;

  // The title must mention the searched year
  if (!years.includes(searchYear)) return false;

  // If only one year and it matches, it's specific
  if (years.length === 1) return true;

  // Multiple years — check if it's a range like "1880-1909" (all years)
  // or a reference to another note (e.g. "1909 VDB + 1910")
  // If years include the searched year but also other non-adjacent years,
  // it's likely a multi-item lot
  if (years.length > 1) {
    // Check if the years are a range (e.g. 1909 appears in "Indian Heads 1880-1909")
    // or separate specific years (e.g. "1909-S, 1910, 1911")
    // If the searched year is the last in a range, it's likely a bulk lot
    if (years.length <= 3) {
      // 2-3 years that are close together might be a specific date listing
      // e.g. "1909, 1910, 1911" — could be individual notes
      return false; // let it through, but mark it
    }
    // More than 3 years — definitely a multi-note lot
    return false;
  }

  return true;
}

/**
 * Filter eBay results to remove bulk lots and multi-item listings,
 * keeping only listings that likely represent a single note.
 */
export function filterEbayResults(items: EbayItem[], searchQuery: string): EbayItem[] {
  const searchYear = extractSearchYear(searchQuery);

  return items.filter(item => {
    if (isBulkOrMultiItemLot(item.title)) {
      console.log(`[eBay] Filtered out bulk lot: "${item.title}"`);
      return false;
    }

    if (!isSpecificToSearch(item.title, searchYear)) {
      console.log(`[eBay] Filtered out non-specific: "${item.title}"`);
      return false;
    }

    return true;
  });
}

/**
 * Get a cached OAuth2 access token (refreshes if expired).
 */
async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires) {
    return cachedToken.token;
  }

  const basic = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString("base64");
  console.log("[eBay] Requesting OAuth token...");
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basic}`,
    },
    body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error("[eBay] Token request failed:", resp.status, text);
    throw new Error(`Token request failed: ${resp.status} ${text}`);
  }

  const data = await resp.json() as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expires: Date.now() + (data.expires_in - 60) * 1000,
  };
  console.log("[eBay] Token obtained successfully");
  return data.access_token;
}

export interface EbayItem {
  itemId: string;
  title: string;
  price: number;
  currency: string;
  condition: string;
  listingUrl: string;
  galleryUrl?: string;
  sellingState: string;
}

/**
 * Search eBay for sold/completed items matching a query.
 */
export async function searchEbayCompleted(query: string): Promise<EbayItem[]> {
  try {
    const token = await getToken();
    const url = `${BROWSE_API}?q=${encodeURIComponent(query)}&limit=10`;
    
    const resp = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      },
    });

    if (!resp.ok) {
      console.error("eBay API error:", resp.status, await resp.text());
      return [];
    }

    const data = await resp.json() as { itemSummaries?: any[] };
    const items = data.itemSummaries || [];

    return items.map((item: any) => ({
      itemId: String(item.itemId || ""),
      title: String(item.title || ""),
      price: parseFloat(item.price?.value || "0"),
      currency: String(item.price?.currency || "USD"),
      condition: String(item.condition || ""),
      listingUrl: String(item.itemWebUrl || item.itemUrl || ""),
      galleryUrl: item.image?.imageUrl || "",
      sellingState: String(item.sellingState || ""),
    }));
  } catch (e) {
    console.error("eBay fetch error:", e);
    return [];
  }
}

/**
 * Extract grade from listing title (handles both coin and paper money grade formats).
 */
export function extractGrade(title: string): string {
  const gradePattern = /\b(MS|AU|XF|VF|F|VG|G|PR|PF|UNC|BU)\s?\d{2}\b/i;
  const match = title.match(gradePattern);
  return match ? match[0].toUpperCase() : "";
}

/**
 * Determine source label.
 */
export function getSource(_category?: string): string {
  return "eBay"; // All items come from eBay
}