/**
 * CPG Public API v2 — Direct Greysheet API Integration
 *
 * Uses the official CPG (Certified Coin Dealer) Public API v2 at
 * https://cpgpublicapiv2.greysheet.com/api
 *
 * Auth: x-api-key + x-api-token headers (from Swagger UI)
 * Endpoints: GET based (ServiceStack REST API)
 *
 * Environment variables:
 *   GREYSHEET_API_KEY   — x-api-key header value
 *   GREYSHEET_API_TOKEN — x-api-token header value
 *
 * @see https://cpgpublicapiv2beta.greysheet.com/swagger-ui for OpenAPI spec
 */

export interface GreysheetItem {
  title: string;
  price: number;
  grade: string;
  date: string;
  source: "Greysheet" | "CPG" | "PCGS" | "NGC" | "BlueBook";
  type: "wholesale" | "retail";
  retailPrice?: number;
  listingUrl?: string;
}

// ─── Configuration ──────────────────────────────────────────────────────

const API_BASE = "https://cpgpublicapiv2.greysheet.com/api";

function getApiKey(): string {
  return process.env.GREYSHEET_API_KEY || "";
}

function getApiToken(): string {
  return process.env.GREYSHEET_API_TOKEN || "";
}

export function hasCredentials(): boolean {
  return !!(getApiKey() && getApiToken());
}

function authHeaders(): Record<string, string> {
  return {
    "x-api-key": getApiKey(),
    "x-api-token": getApiToken(),
  };
}

// ─── API Call ────────────────────────────────────────────────────────────

/**
 * Make a GET request to the CPG API.
 */
async function apiGet<T = any>(
  endpoint: string,
  params: Record<string, string | number> = {},
): Promise<T | null> {
  const apiKey = getApiKey();
  const apiToken = getApiToken();
  if (!apiKey || !apiToken) return null;

  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") query.set(k, String(v));
  }

  const url = `${API_BASE}/${endpoint}?${query.toString()}`;

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        ...authHeaders(),
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      console.log(`[Greysheet] ${endpoint} returned HTTP ${resp.status}`);
      return null;
    }

    return await resp.json();
  } catch (e) {
    console.error(`[Greysheet] ${endpoint} error:`, e);
    return null;
  }
}

// ─── Catalog Browsing ────────────────────────────────────────────────────

/** A node in the CPG catalog tree. */
interface CatalogNode {
  Id: number;
  Name: string;
  NodeChildrenCountLive: number;
  CollectibleChildrenCountLive: number;
  ParentNode_Id?: number | null;
}

/** A collectible entry (note type) returned from the catalog. */
interface CollectibleEntry {
  Gsid: number;
  Name: string;
  ParentNode_Id?: number | null;
  NoteDate?: string;
  DenominationShort?: string;
  Series?: string;
}

// ─── Known catalog category keywords ────────────────────────────────────
// Map common note types to their CPG catalog node IDs.
// Discovered from Greysheet CPG Public API v2 catalog tree (2026-07-23):
//   Root → U.S. Currency (2) → Large Size Notes (8197) / Small Size Notes (8217)
//
// Named series (Educational, Black Eagle, Bison, Chief, Rainbow, Battleship)
// are collectibles within their parent category node rather than separate nodes.
const CATEGORY_KEYWORDS: Record<string, { nodeIds: number[]; keyword: string }> = {
  // Broad type categories (span both Large and Small)
  "silver certificate":    { nodeIds: [9212, 9213], keyword: "silver certificate" },
  "gold certificate":      { nodeIds: [9214, 9215], keyword: "gold certificate" },
  "legal tender":          { nodeIds: [9210, 9211], keyword: "legal tender" },
  "federal reserve note":  { nodeIds: [9218, 9219, 15187, 9650, 9651, 9652, 9653, 9654, 9655, 9656, 9657, 9658], keyword: "federal reserve note" },
  "national bank note":    { nodeIds: [9337, 9216, 9767, 9768, 9217, 9766], keyword: "national bank note" },
  "federal reserve bank":  { nodeIds: [9220, 9221], keyword: "federal reserve bank" },

  // Large-size-only types
  "treasury note":         { nodeIds: [9223], keyword: "treasury note" },
  "demand note":           { nodeIds: [9226], keyword: "demand note" },
  "compound interest":     { nodeIds: [9306], keyword: "compound interest" },
  "refunding certificate": { nodeIds: [9225], keyword: "refunding certificate" },

  // Named series within Silver Certificates - Large (9212)
  "educational":           { nodeIds: [9212], keyword: "educational" },
  "black eagle":           { nodeIds: [9212], keyword: "black eagle" },
  "chief":                 { nodeIds: [9212], keyword: "chief" },
  "rainbow":               { nodeIds: [9212], keyword: "rainbow" },

  // Named series within Legal Tender - Large (9210)
  "bison":                 { nodeIds: [9210], keyword: "bison" },

  // Named series within Federal Reserve Bank Notes - Large (9220)
  "battleship":            { nodeIds: [9220], keyword: "battleship" },

  // Seal color aliases — collectors commonly refer to notes by seal color
  "red seal":              { nodeIds: [9210, 9211], keyword: "red seal" },
  "blue seal":             { nodeIds: [9212, 9213], keyword: "blue seal" },
  "green seal":            { nodeIds: [9218, 9219, 15187, 9650, 9651, 9652, 9653, 9654, 9655, 9656, 9657, 9658], keyword: "green seal" },
  "yellow seal":           { nodeIds: [9214, 9215], keyword: "yellow seal" },
  "brown seal":            { nodeIds: [9216, 9217, 9766, 9767, 9768, 9337], keyword: "brown seal" },

  // Size-based broad searches (use all known leaf nodes)
  "small size":            { nodeIds: [9211, 9213, 9215, 9217, 9219, 9221, 9222, 16005], keyword: "small size" },
  "large size":            { nodeIds: [9210, 9212, 9214, 9216, 9218, 9220, 9223, 9225, 9226, 9306], keyword: "large size" },

  // WWII emergency issues
  "hawaii":                { nodeIds: [9222], keyword: "hawaii" },
  "north africa":          { nodeIds: [16005], keyword: "north africa" },
};

/** 
 * Fallback nodes for paper money: search ALL known leaf-level category nodes.
 * Container nodes (8197, 8217) return 0 collectibles via GetCollectibleByNodeRequest,
 * so we must enumerate every leaf node under U.S. Currency (2).
 */
const PAPER_MONEY_FALLBACK_NODES = [
  // Large Size leaf nodes
  9210, // Legal Tender - Large
  9212, // Silver Certificates - Large
  9214, // Gold Certificates - Large
  9216, // National Bank Notes - Large
  9218, // Federal Reserve Notes - Large
  9220, // Federal Reserve Bank Notes - Large
  9223, // Treasury Notes - Large
  9225, // Refunding Certificates - Large
  9226, // Demand Notes - Large
  9306, // Compound Interest - Large
  // Small Size leaf nodes
  9211, // Legal Tender - Small
  9213, // Silver Certificates - Small
  9215, // Gold Certificates - Small
  9217, // National Bank Notes - Small
  9219, // Federal Reserve Notes - Small
  9221, // Federal Reserve Bank Notes - Small
  9222, // Hawaii - Small
  16005, // North Africa - Small
  // Additional FRN sub-series
  15187, 9650, 9651, 9652, 9653, 9654, 9655, 9656, 9657, 9658,
  // Additional NBN sub-series
  9337, 9766, 9767, 9768,
];

/**
 * Walk the CPG catalog tree to find a GsId matching the query.
 *
 * Strategy:
 *   1. Parse the query for known note-type keywords
 *   2. Look up the known category node ID
 *   3. Get collectibles from that node
 *   4. Match the specific note by name/year
 */
async function findGsId(query: string): Promise<{ gsid: number; name: string } | null> {
  const searchTerm = query.toLowerCase().trim();
  if (!searchTerm) return null;

  // Try direct PCGS Number lookup — if query looks like a number, try it
  const yearMatch = searchTerm.match(/\b(18\d{2}|19\d{2}|20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : null;

  // Find which category nodes this note belongs to
  let targetNodeIds: number[] = [];
  let matchedKeyword = "";
  const triedNodes: number[] = [];

  for (const [keyword, mapping] of Object.entries(CATEGORY_KEYWORDS)) {
    if (searchTerm.includes(keyword.toLowerCase())) {
      targetNodeIds = mapping.nodeIds;
      matchedKeyword = mapping.keyword;
      break;
    }
  }

  // Candidate nodes: specific matched nodes first, then paper money fallbacks.
  // For keyword-matched searches, search ALL target nodes (don't break on
  // first with data — a query like "red seal" matches both Large and Small
  // nodes, and the note might only be in Small). For fallback searches,
  // collect from all leaf nodes but stop early once we have enough data.
  const hasSpecificMatch = targetNodeIds.length > 0;
  const candidateNodes: number[] = [...targetNodeIds];
  if (!hasSpecificMatch) {
    for (const fn of PAPER_MONEY_FALLBACK_NODES) {
      if (!candidateNodes.includes(fn)) candidateNodes.push(fn);
    }
  }

  // Collect collectibles from candidate nodes.
  const allCollectibles: CollectibleEntry[] = [];
  
  for (const nodeId of candidateNodes) {
    const data = await apiGet<any>("GetCollectibleByNodeRequest", { NodeId: nodeId });
    if (data?.Data?.length) {
      const nodeCollectibles = data.Data as CollectibleEntry[];
      console.log(`[Greysheet] Node ${nodeId}: ${nodeCollectibles.length} collectibles`);
      allCollectibles.push(...nodeCollectibles);
      
      // For keyword-matched searches, search ALL target nodes (may span sizes).
      // For fallback searches, stop after accumulating enough collectibles.
      if (!hasSpecificMatch && allCollectibles.length > 500) break;
    } else {
      triedNodes.push(nodeId);
    }
  }

  if (allCollectibles.length === 0) {
    if (triedNodes.length > 0) {
      console.log(`[Greysheet] No collectibles found in tried nodes: ${triedNodes.join(", ")}`);
    } else {
      console.log(`[Greysheet] No matching catalog category found for "${query}"`);
    }
    return null;
  }

  // De-duplicate by GsId (same collectible may appear in multiple nodes)
  const seen = new Set<number>();
  const collectibles = allCollectibles.filter(c => {
    if (seen.has(c.Gsid)) return false;
    seen.add(c.Gsid);
    return true;
  });

  console.log(`[Greysheet] Total unique collectibles across nodes: ${collectibles.length}`);

  // Score each collectible by how well it matches the search term
  let bestMatch: { gsid: number; name: string; score: number } | null = null;

  for (const c of collectibles) {
    const name = (c.Name || "").toLowerCase();
    let score = 0;

    // Exact match wins
    if (name === searchTerm) score = 100;
    // Contains the full search query
    else if (name.includes(searchTerm)) score = 80;
    // Contains all significant words from the query
    else {
      const queryWords = searchTerm.split(/\s+/).filter(w => w.length > 1);
      const nameWords = name.split(/\s+/);
      let matches = 0;
      for (const qw of queryWords) {
        if (nameWords.some(nw => nw === qw || nw.startsWith(qw) || qw.startsWith(nw))) {
          matches++;
        }
      }
      score = (matches / queryWords.length) * 60;
    }

    // Bonus for matching the year
    if (year && name.includes(year)) score += 15;
    // Bonus for matching keyword in name
    if (matchedKeyword && name.includes(matchedKeyword)) score += 10;

    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { gsid: c.Gsid, name: c.Name, score };
    }
  }

  if (bestMatch) {
    console.log(`[Greysheet] Best match: "${bestMatch.name}" (Gsid=${bestMatch.gsid}, score=${bestMatch.score})`);
    return { gsid: bestMatch.gsid, name: bestMatch.name };
  }

  // Fallback: return the first result if there's only one
  if (collectibles.length === 1) {
    const c = collectibles[0];
    console.log(`[Greysheet] Single collectible: "${c.Name}" (Gsid=${c.Gsid})`);
    return { gsid: c.Gsid, name: c.Name };
  }

  console.log(`[Greysheet] No match found in ${collectibles.length} collectibles for "${query}"`);
  return null;
}

// ─── Price Parsing ───────────────────────────────────────────────────────

/**
 * Parse GetPricingResponse into GreysheetItem[].
 *
 * Response format:
 * {
 *   "Data": [{
 *     "GsId": 1,
 *     "Name": "1652 3P Willow Tree MS",
 *     "PricingData": [{
 *       "Grade": 50,
 *       "GradeLabel": "AU50",
 *       "CpgVal": "660,000.00",
 *       "GreyVal": "",
 *       "PcgsVal": "",
 *       "NgcVal": "",
 *       "BlueBookVal": ""
 *     }]
 *   }]
 * }
 */
function parsePricingResponse(data: any, query: string): GreysheetItem[] {
  const items: GreysheetItem[] = [];
  const today = new Date().toISOString().substring(0, 10);

  const entries = data?.Data || data?.data || [];
  if (!Array.isArray(entries)) return [];

  for (const entry of entries) {
    const name = entry.Name || entry.name || query;
    const pricing = entry.PricingData || entry.pricingData || [];
    console.log(`[Greysheet] parsePricingResponse: ${pricing.length} pricing entries for "${name}"`);
    
    // Log first 3 grade labels for debugging
    const sampleGrades = pricing.slice(0, 3).map((p: any) => p.GradeLabel || p.gradeLabel || `MS${p.Grade || 0}`);
    console.log(`[Greysheet] Sample grades: ${sampleGrades.join(", ")}`);

    for (const p of pricing) {
      const gradeLabel = p.GradeLabel || p.gradeLabel || `MS${p.Grade || 0}`;

      // CPG Retail value
      const cpgVal = parsePriceString(p.CpgVal);
      // Greysheet wholesale bid
      const greyVal = parsePriceString(p.GreyVal);
      console.log(`[Greysheet] ${gradeLabel}: greyVal=${greyVal} cpgVal=${cpgVal}`);
      // Other sources
      const pcgsVal = parsePriceString(p.PcgsVal);
      const ngcVal = parsePriceString(p.NgcVal);
      const bbVal = parsePriceString(p.BlueBookVal);

      if (greyVal > 0) {
        items.push({
          title: name,
          price: greyVal,
          grade: gradeLabel,
          date: today,
          source: "Greysheet",
          type: "wholesale",
          retailPrice: cpgVal > 0 ? cpgVal : undefined,
        });
      }

      if (cpgVal > 0 && greyVal !== cpgVal) {
        items.push({
          title: name,
          price: cpgVal,
          grade: gradeLabel,
          date: today,
          source: "CPG",
          type: "retail",
        });
      }
    }
  }

  return items;
}

function parsePriceString(val: string | undefined | null): number {
  if (!val) return 0;
  const cleaned = String(val).replace(/[$,]/g, "").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// ─── Main Search Function ───────────────────────────────────────────────

/**
 * Find the CPG catalog category node ID for a given note query.
 * Uses the keyword-to-category mapping to identify which catalog node
 * contains the note type.
 */
export function findCategoryNodeId(query: string): number | null {
  const searchTerm = query.toLowerCase().trim();
  if (!searchTerm) return null;

  for (const [keyword, mapping] of Object.entries(CATEGORY_KEYWORDS)) {
    if (searchTerm.includes(keyword.toLowerCase())) {
      return mapping.nodeIds[0] ?? null;
    }
  }
  return null;
}

/**
 * Get all collectibles from a catalog category node.
 * Returns the raw collectible data (GsId, Name, Series, etc.).
 */
export async function getCollectiblesByCategory(nodeId: number): Promise<CollectibleEntry[]> {
  if (!hasCredentials()) return [];

  const data = await apiGet<any>("GetCollectibleByNodeRequest", {
    NodeId: nodeId,
  });

  if (!data?.Data?.length) return [];
  return data.Data as CollectibleEntry[];
}

/**
 * Search Greysheet for wholesale/retail pricing on a note.
 *
 * Strategy:
 *   1. Try pricing by Gsid (need to resolve note name → Gsid)
 *   2. Returns empty if not found (caller falls through to Neon DB)
 *
 * @param query - Note name (e.g. "1928 $2 Red Seal")
 * @returns Structured pricing items with source attribution
 */
export async function searchGreysheet(query: string): Promise<GreysheetItem[]> {
  if (!hasCredentials()) {
    console.log("[Greysheet] GREYSHEET_API_KEY and GREYSHEET_API_TOKEN not configured");
    return [];
  }

  // Try to find the Gsid for this note name
  const found = await findGsId(query);
  if (!found) {
    console.log(`[Greysheet] No Gsid found for "${query}"`);
    return [];
  }

  console.log(`[Greysheet] Found Gsid ${found.gsid}: "${found.name}"`);
  const data = await apiGet<any>("GetPricingRequest", {
    Gsid: found.gsid,
  });

  if (!data) {
    console.log("[Greysheet] No pricing data returned");
    return [];
  }

  const items = parsePricingResponse(data, found.name);
  console.log(`[Greysheet] Found ${items.length} pricing entries`);
  return items;
}

/**
 * Extract a standardized grade string from raw text.
 * Handles both coin (MS/AU/XF) and paper money (CU/GEM) grade formats.
 */
export function extractGrade(grade: string): string {
  const pattern = /\b(MS|AU|XF|VF|F|VG|G|PR|PF|UNC|BU)\s?\d{2}\b/i;
  const m = grade.match(pattern);
  return m ? m[0].toUpperCase() : grade;
}

/**
 * Source label for display.
 */
export function getSource(): string {
  return "Greysheet (CPG Public API v2) — Wholesale Dealer Pricing";
}