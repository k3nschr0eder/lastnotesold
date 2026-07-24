/**
 * LastNoteSold API — Server Functions
 * 
 * Runs all data sources independently and returns tabbed results.
 *   - Sold-Comps (real eBay sold prices)
 *   - eBay Browse API (active listing asking prices)
 *   - Greysheet/CPG Public API v2 (wholesale dealer pricing)
 *   - Neon database (curated seed data — fallback)
 */
import { createServerFn } from "@tanstack/react-start";
import { dbQuery, dbExec } from "~/lib/db-tool";
import { computePricing } from "~/lib/pricing-engine";
import { searchEbayCompleted, extractGrade as extractEbayGrade, filterEbayResults } from "~/lib/ebay-api";
import { searchGreysheet, hasCredentials as hasGreysheetCreds, findCategoryNodeId, getCollectiblesByCategory } from "~/lib/greysheet-api";
import { searchSoldComps, hasCredentials as hasSoldCompsCreds } from "~/lib/soldcomps-api";
import { getTierConfig } from "~/lib/tiers";
import type { PriceResult, SaleRecord } from "~/lib/pricing-engine";

export interface LookupQuery {
  query: string;
  year?: number;
  grade?: string;
  certification?: string;
  series?: string;
  note_type?: string;
  /** Free-tier fingerprint for rate limiting */
  fingerprint?: string;
}

/** Tabbed lookup result — each source is a separate PriceResult or null. */
export interface TabbedLookupResult {
  ebay: PriceResult | null;
  greysheet: PriceResult | null;
  soldcomps: PriceResult | null;
  db: PriceResult | null;
  tier?: "free" | "pro" | "premier";
  freeLookupsRemaining?: number;
  error?: string;
}

/** Build a PriceResult (with source/note) from sales data. */
function buildPriceResult(
  source: string,
  note: string,
  terms: string,
  sales: SaleRecord[],
  options?: { grade?: string; certification?: string; skipTrim?: boolean },
): PriceResult {
  return {
    ...computePricing(terms, sales, { ...options, skipTrim: options?.skipTrim }),
    source,
    note,
  };
}

/**
 * Search note pricing — runs all data sources and returns tabbed results.
 */
export const lookupNote = createServerFn({ method: "POST" })
  .validator((data: LookupQuery) => data)
  .handler(async ({ data }) => {
    const rawQuery = data.query?.trim() || "";
    if (!rawQuery && !data.note_type) {
      return { ebay: null, greysheet: null, soldcomps: null, db: null, error: "Missing query or note_type" };
    }

    const terms = (rawQuery || data.note_type || "").trim();
    if (!terms) {
      return { ebay: null, greysheet: null, soldcomps: null, db: null, error: "Empty search term" };
    }

    // Determine tier — free by default, upgraded via webhook subscriptions
    // Use the client's IP as fingerprint for free tier rate limiting
    const clientIp = data.fingerprint || "anon";
    const tierConfig = await getTierConfig({
      fingerprint: clientIp || "anon",
    });

    console.log(`[lookupNote] Tier: ${tierConfig.tier}, showSoldComps: ${tierConfig.showSoldComps}, hasSoldCompsCreds: ${hasSoldCompsCreds()}, showGreysheet: ${tierConfig.showGreysheet}, hasGreysheetCreds: ${hasGreysheetCreds()}`);

    try {
      // === Fetch data sources based on tier ===
      // Use allSettled so a slow Sold-Comps API doesn't block other results from rendering.
      // Each source has its own internal timeout; we add a shorter outer deadline here
      // so the whole lookup returns fast even if one source is hanging.
      const withDeadline = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
        Promise.race([
          p,
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
          ),
        ]);

      const results = await Promise.allSettled([
        searchEbayCompleted(terms),
        tierConfig.showGreysheet && hasGreysheetCreds()
          ? searchGreysheet(terms)
          : Promise.resolve([] as any[]),
        tierConfig.showSoldComps && hasSoldCompsCreds()
          ? withDeadline(searchSoldComps(terms, tierConfig.maxComps), 20000, "SoldComps")
          : Promise.resolve([] as any[]),
      ]);

      const ebayItemsRaw = results[0].status === "fulfilled" ? results[0].value : [];
      const greysheetItems = results[1].status === "fulfilled" ? results[1].value : [];
      const soldCompsItems = results[2].status === "fulfilled" ? results[2].value : [];

      if (results[2].status === "rejected") {
        console.error(`[lookupNote] SoldComps FAILED: ${results[2].reason}`);
      } else if (results[2].status === "fulfilled" && soldCompsItems.length === 0) {
        console.warn("[lookupNote] SoldComps returned 0 items — API may be slow, rate-limited, or no results found");
      }

      // Filter eBay results (remove bulk lots)
      const filteredItems = filterEbayResults(ebayItemsRaw, terms);
      console.log(`[lookupNote] eBay: ${filteredItems.length}, Greysheet: ${greysheetItems.length}, SoldComps: ${soldCompsItems.length}`);

      // ── Build eBay result ──
      let ebayResult: PriceResult | null = null;
      if (filteredItems.length > 0) {
        const sales: SaleRecord[] = filteredItems.map((item, i) => ({
          id: i,
          note_id: 0,
          source: "eBay",
          sale_date: new Date().toISOString().substring(0, 10),
          price: item.price,
          grade: extractEbayGrade(item.title) || item.condition || "N/A",
          auction_house: "eBay",
          sale_url: item.listingUrl,
        }));
        // Apply tier comp limit
        const limitedSales = sales.slice(0, tierConfig.maxComps);
        ebayResult = buildPriceResult(
          "eBay Active Listings",
          "Asking prices from active eBay listings — actual sold prices may vary",
          terms, limitedSales,
        );
      }

      // ── Build Greysheet result ──
      let greysheetResult: PriceResult | null = null;
      if (greysheetItems.length > 0) {
        console.log(`[lookupNote] Greysheet returned ${greysheetItems.length} items (sources: ${[...new Set(greysheetItems.map(i => i.source))].join(",")})`);
        const sales: SaleRecord[] = greysheetItems.map((item, i) => ({
          id: i,
          note_id: 0,
          source: item.source,
          sale_date: item.date,
          price: item.price,
          grade: item.grade,
          auction_house: item.source === "CPG" ? "CPG Retail" : "Greysheet (CDN)",
          sale_url: item.listingUrl,
        }));
        greysheetResult = buildPriceResult(
          "Greysheet CPG",
          "CPG retail pricing from Greysheet — subscription required",
          terms, sales, { skipTrim: true, maxRecentSales: 50 },
        );
        console.log(`[lookupNote] Greysheet comps_count: ${greysheetResult.comps_count}`);
      } else if (!hasGreysheetCreds()) {
        console.log("[lookupNote] Greysheet not configured — skipping");
      } else {
        console.log("[lookupNote] Greysheet returned 0 items — note may not be in CPG catalog");
      }

      // ── Build Sold-Comps result ──
      let soldCompsResult: PriceResult | null = null;
      if (soldCompsItems.length > 0) {
        const sales: SaleRecord[] = soldCompsItems
          .filter((item) => {
            const p = typeof item.soldPrice === "string" ? parseFloat(item.soldPrice) : item.soldPrice;
            return typeof p === "number" && !Number.isNaN(p) && p > 0;
          })
          .map((item, i) => ({
          id: i,
          note_id: 0,
          source: "eBay Sold",
          sale_date: item.endedAt ? item.endedAt.substring(0, 10) : new Date().toISOString().substring(0, 10),
          price: typeof item.soldPrice === "string" ? parseFloat(item.soldPrice) : item.soldPrice,
          grade: item.condition || "N/A",
          auction_house: item.sellerUsername || "eBay Sold",
          sale_url: item.url,
        }));
        soldCompsResult = buildPriceResult(
          "eBay Sold Listings",
          "Actual sold prices from recent eBay transactions via Sold-Comps",
          terms, sales,
        );
        console.log(`[lookupNote] SoldComps comps_count: ${soldCompsResult.comps_count}`);
      } else if (!hasSoldCompsCreds()) {
        console.log("[lookupNote] SoldComps not configured — skipping");
      }

      // ── Build Database fallback ──
      let dbResult: PriceResult | null = null;
      const searchTerm = `%${terms}%`;
      const notes = await dbQuery<{ id: number; name: string }>(
        "SELECT id, name FROM notes WHERE name LIKE ? LIMIT 20", [searchTerm]
      );

      if (notes.rows.length > 0) {
        const noteIds = notes.rows.map((c) => c.id);
        const placeholders = noteIds.map(() => "?").join(",");
        const salesResult = await dbQuery<{ id: number; note_id: number; source: string; sale_date: string; price: number; grade: string; auction_house: string; certification: string | null; sale_url: string | null }>(
          `SELECT id, note_id, source, sale_date, price, grade, auction_house, certification, sale_url FROM sales WHERE note_id IN (${placeholders}) ORDER BY sale_date DESC LIMIT 50`,
          noteIds
        );

        if (salesResult.rows.length > 0) {
          const dbSales: SaleRecord[] = salesResult.rows.map((s) => ({
            id: s.id,
            note_id: s.note_id,
            source: s.source,
            sale_date: s.sale_date,
            price: s.price,
            grade: s.grade,
            auction_house: s.auction_house,
            certification: s.certification ?? undefined,
            sale_url: s.sale_url ?? undefined,
          }));
          dbResult = buildPriceResult(
            "Historical Auction Data",
            "Sample data — eBay API will provide real-time results when available",
            terms, dbSales,
            { grade: data.grade, certification: data.certification },
          );
        }
      }

      // Log lookup
      try {
        const primary = ebayResult || greysheetResult || dbResult;
        await dbExec(
          "INSERT INTO lookup_history (query, result_summary, comps_count) VALUES (?, ?, ?)",
          [rawQuery, primary?.summary || "", primary?.comps_count || 0]
        );
      } catch { /* ignore */ }

      return {
        ebay: ebayResult,
        greysheet: greysheetResult,
        soldcomps: soldCompsResult,
        db: dbResult,
        tier: tierConfig.tier,
        freeLookupsRemaining: tierConfig.freeLookupsRemaining,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ebay: null, greysheet: null, soldcomps: null, db: null, error: msg };
    }
  });

/**
 * Autocomplete — return up to 15 matching note names.
 */
export const autocompleteNotes = createServerFn({ method: "GET" })
  .validator((data: { q: string }) => data)
  .handler(async ({ data }) => {
    const q = (data.q || "").trim();
    if (!q || q.length < 1) {
      return { suggestions: [] };
    }

    try {
      const result = await dbQuery<{ name: string }>(
        "SELECT DISTINCT name FROM notes WHERE name LIKE ? ORDER BY name LIMIT 15",
        [`%${q}%`]
      );
      return { suggestions: result.rows.map((r) => r.name) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { error: msg, suggestions: [] };
    }
  });

/**
 * Note variety suggestions — given a partial note description,
 * find related varieties (series, denominations) from the Greysheet catalog.
 *
 * Example: search "1928 gold certificate" → suggests "1928 $20 Gold Certificate", "1928 $50 Gold Certificate"
 */
export const suggestVariations = createServerFn({ method: "GET" })
  .validator((data: { q: string }) => data)
  .handler(async ({ data }) => {
    const q = (data.q || "").trim();
    if (!q || q.length < 2) {
      return { suggestions: [] };
    }

    try {
      // Extract year from query
      const yearMatch = q.match(/\b(18\d{2}|19\d{2}|20\d{2})\b/);
      const year = yearMatch ? yearMatch[1] : null;

      // Find the category node for this note type
      const nodeId = findCategoryNodeId(q);
      if (!nodeId) {
        console.log(`[suggestVariations] No category node found for: "${q}"`);
        return { suggestions: [] };
      }

      // Get all collectibles in this category
      const collectibles = await getCollectiblesByCategory(nodeId);
      if (collectibles.length === 0) {
        return { suggestions: [] };
      }

      const searchLower = q.toLowerCase();
      const queryWords = searchLower.split(/\s+/).filter(w => w.length > 1);

      // Filter and score collectibles
      const scored: Array<{ name: string; gsid: number; score: number }> = [];

      for (const c of collectibles) {
        const noteName = (c.Name || "").toLowerCase();
        let score = 0;

        // Year match is required if year is specified
        if (year && !noteName.includes(year)) continue;

        // Full name contains the search query
        if (noteName.includes(searchLower)) {
          score = 50;
        } else {
          // Word-by-word matching
          let matches = 0;
          for (const qw of queryWords) {
            if (qw === year) continue; // already checked
            if (noteName.includes(qw)) matches++;
          }
          score = (matches / Math.max(queryWords.length - (year ? 1 : 0), 1)) * 40;
        }

        // Boost for matching the exact year
        if (year && noteName.includes(year)) score += 20;

        // Only include if it's a reasonable match
        if (score > 15) {
          scored.push({ name: c.Name, gsid: c.Gsid, score });
        }
      }

      // Sort by score (highest first), limit to top 12
      scored.sort((a, b) => b.score - a.score);
      const suggestions = scored.slice(0, 12).map(s => ({
        name: s.name,
        gsid: s.gsid,
      }));

      console.log(`[suggestVariations] Found ${suggestions.length} variations for: "${q}"`);
      return { suggestions };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[suggestVariations] Error:`, msg);
      return { error: msg, suggestions: [] };
    }
  });