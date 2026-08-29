/**
 * Sold-Comps keyword builder + title filter for LastNoteSold (banknotes).
 *
 * Ported from the LCS sold-comps junk fix (LCS PR #196) but with NOTE/banknote
 * series anchors — coin series (Morgan/Lincoln/etc.) are meaningless on LNS.
 *
 * BUG (owner-flagged, 8/29): /api/soldcomps AND the eBay Browse path passed the
 * RAW user query verbatim as the keyword, so loose free-text like "1928 $20
 * note" matched non-banknote junk (coins, toy money, posters, etc.). This module:
 *   1. Builds a disciplined eBay keyword - parsed series year + a note-type /
 *      denomination anchor (e.g. "1928 $20 note" -> "1928 $20 Federal Reserve
 *      Note"; "1957 silver certificate" -> "1957 Silver Certificate"), dropping
 *      noisy filler tokens (grading terms, certification, ambiguous "bill").
 *   2. Post-filters returned items by title: rejects listings that are clearly
 *      NOT the requested banknote (coins, stamps, toy/play money, posters,
 *      prints, replica/fantasy/counterfeit notes, ephemera, bulk lots / strapped
 *      bundles / uncut sheets / star-less packs) + conflicting note type /
 *      denomination (a $5 in a $20 search, a Gold Certificate in an FRN search).
 *
 * Sole copy lives here (LNS has NO soldcomps heredoc) — wire into BOTH the
 * Sold-Comps path AND the eBay Active path so widening never resurrects junk.
 */

// Non-banknote junk that must NEVER appear as a note comp.
export const NB_JUNK_RE =
  /(toy\s*money|play\s*money|fun\s*money|fake\s*money|movie\s*money|prop\s*money|monopoly|\bpretend\b|\breplica\b|\bfacsimile\b|\bfantasy\b|\bcounterfeit\b|\bforgery\b|\bnovelty\b|\brepro\b|\bcopy\b|\bprint\b|\bposter\b|\blithograph\b|\bartwork\b|\bpainting\b|\bphotograph\b|\bphoto\b|\bstamp\b|\bcoin\b|\bcoins\b|\bpenny\b|\bnickel\b|\bdime\b|\bquarter\b|\bmorgan\b|\bwheat\b|\blincoln\b|\bsilver\s*eagle\b|\bgold\s*eagle\b|\bmedal\b|\bmedallion\b|\btoken\b|\btrading\s*card\b|\bsports\s*card\b|\bcomic\b|\bvideo\s*game\b|\bdie-?cast\b|\bslot\s*car\b|\btoy\b|\blego\b|\baction\s*figure\b|\bt-shirt\b|\bshirt\b|\bmug\b|\bkeychain\b|\bfridge\s*magnet\b|\bdecal\b|\bsticker\b|\bpin\b|\bbadge\b|\bbutton\b|\blighter\b|\bphone\s*case\b|\bwatch\b|\bhat\b|\bspoon\b|\bcup\b|\bglass\b|\bsavings\s*bond\b|\bstock\s*certificate\b|\bshare\s*certificate\b|\bbond\b|\bcheck\b|\bcoupon\b|\bticket\b|\bpostcard\b|\benvelope\b|\bletterhead\b|\bephemera\b|\bautograph\b|\bsignature\s*card\b|\bhistory\s*card\b|\bdollar\s*foundation\b|\bfoundation\b|\bcurrency\s*calculator\b|\bdetector\b|\bappraisal\b|\bholder\b|\bsleeve\b|\balbum\b|\bfolder\b|\bdisplay\s*box\b|\bcase\s*only\b|\bcoin\s*bank\b|\bpiggy\s*bank\b|\bmoney\s*clip\b|\bwallet\b|\bbelt\s*buckle\b|\buncut\s*sheet\b|\bbrick\b|\bstrap\b|\bbundle\b|\bpack\s+of\b|\beach\b|\bper\s+note\b|\bmixed\s+lot\b|\bgroup\s+of\b|\bhoard\b|\baccumulation\b|\bcollection\s+of\b|\blots?\b|\b\d+\s*notes?\b|\b\d+\s*pc(?:s)?\b|\b\d+\s*x\s*\b)/i;

// Fill/noise tokens stripped in the no-anchor fallback path.
const NB_FILLER_RE = new RegExp(
  "\\b(pcgs|pmg|ngc|cga|ppq|epq|graded|slabbed|certified|crisp|crisp\\s*uncirculated|uncirculated|about\\s*uncirculated|circulated|gem|choice|very\\s*fine|extremely\\s*fine|fine|very\\s*good|good|cu|au|xf|vf|f|vg|g|series\\s*of|series|plate\\s*no|serial|frn|ltn|silver\\s*cert|gold\\s*cert|note|bill|paper\\s*money|banknote|currency|collectible|rare|rarity|clean|nice|beautiful|excellent|awesome|vintage|old|antique|original|genuine|authentic|large\\s*size|small\\s*size|type\\s*1|type\\s*2|type\\s*1a)\\b",
  "ig",
);

// Banknote series / note-type anchors -> canonical eBay keyword + title-match
// tokens + optional conflict (a DIFFERENT note type that must be rejected).
interface NoteAnchor {
  re: RegExp;
  kw: string;
  match: RegExp[];
  conflict?: RegExp;
}
export const NB_SERIES_ANCHORS: NoteAnchor[] = [
  {
    re: /\bfederal\s*reserve\s*(note)?\b|\bfrn\b/i,
    kw: "Federal Reserve Note",
    match: [/\bfederal\s*reserve\b/i, /\bfrn\b/i, /\breserve\s*note\b/i],
    conflict: /\b(?:silver\s*certificate|gold\s*certificate|united\s*states\s*note|legal\s*tender|national\s*bank|confederate)\b/i,
  },
  {
    re: /\bsilver\s*certificate\b|\bsilver\s*cert\b/i,
    kw: "Silver Certificate",
    match: [/\bsilver\s*certificate\b/i, /\bsilver\s*cert\b/i],
    conflict: /\b(?:gold\s*certificate|federal\s*reserve|united\s*states\s*note|legal\s*tender|national\s*bank|confederate)\b/i,
  },
  {
    re: /\bgold\s*certificate\b|\bgold\s*cert\b/i,
    kw: "Gold Certificate",
    match: [/\bgold\s*certificate\b/i, /\bgold\s*cert\b/i],
    conflict: /\b(?:silver\s*certificate|federal\s*reserve|united\s*states\s*note|legal\s*tender|national\s*bank|confederate)\b/i,
  },
  {
    re: /\bunited\s*states\s*note\b|\blegal\s*tender\b|\bltn\b/i,
    kw: "United States Note",
    match: [/\bunited\s*states\s*note\b/i, /\blegal\s*tender\b/i, /\bltn\b/i, /\bnote\b/i],
    conflict: /\b(?:federal\s*reserve|silver\s*certificate|gold\s*certificate|national\s*bank|confederate)\b/i,
  },
  {
    re: /\bnational\s*bank\s*note\b|\bnational\s*bank\b/i,
    kw: "National Bank Note",
    match: [/\bnational\s*bank\b/i],
    conflict: /\b(?:federal\s*reserve|silver\s*certificate|gold\s*certificate|united\s*states\s*note|legal\s*tender|confederate)\b/i,
  },
  {
    re: /\bhawaii\b|\bww\s*ii\b|\bworld\s*war\s*(ii|two)\b|\bbrown\s*seal\b/i,
    kw: "Hawaii Note",
    match: [/\bhawaii\b/i, /\bbrown\s*seal\b/i],
    conflict: /\b(?:silver\s*certificate|gold\s*certificate|united\s*states\s*note|legal\s*tender|national\s*bank|confederate)\b/i,
  },
  {
    re: /\bstar\s*(note|replacement)?\b|\bstarred\b/i,
    kw: "Star Note",
    match: [/\bstar\s*note\b/i, /\bstarred\b/i, /\breplacement\s*note\b/i],
  },
  {
    re: /\blarge\s*size\b/i,
    kw: "Large Size US Note",
    match: [/\blarge\s*size\b/i, /\bnational\s*bank\b/i, /\bsilver\s*certificate\b/i],
  },
  {
    re: /\bconfederate\b/i,
    kw: "Confederate Note",
    match: [/\bconfederate\b/i],
    conflict: /\b(?:federal\s*reserve|silver\s*certificate|gold\s*certificate|united\s*states\s*note|legal\s*tender|national\s*bank)\b/i,
  },
];

// Denomination detection (banknote $1/$2/$5/$10/$20/$50/$100 + word forms).
interface DenomMatch { kw: string; tokens: RegExp[]; conflictTokens: RegExp[]; }
const DENOMS: Array<{ re: RegExp; kw: string; tokens: RegExp[] }> = [
  { re: /\$100\b|\b100\s*dollar\b|\bhundred\s*dollar\b|\bc\s*note\b/i, kw: "$100", tokens: [/\$100\b/, /\b100\s*dollar\b/, /\bhundred\b/] },
  { re: /\$50\b|\b50\s*dollar\b|\bfifty\s*dollar\b/i, kw: "$50", tokens: [/\$50\b/, /\b50\s*dollar\b/, /\bfifty\b/] },
  { re: /\$20\b|\b20\s*dollar\b|\btwenty\s*dollar\b|\bjackson\b/i, kw: "$20", tokens: [/\$20\b/, /\b20\s*dollar\b/, /\btwenty\b/] },
  { re: /\$10\b|\b10\s*dollar\b|\bten\s*dollar\b|\bhamilton\b/i, kw: "$10", tokens: [/\$10\b/, /\b10\s*dollar\b/, /\bten\b/] },
  { re: /\$5\b|\b5\s*dollar\b|\bfive\s*dollar\b|\blincoln\s*bill\b/i, kw: "$5", tokens: [/\$5\b/, /\b5\s*dollar\b/, /\bfive\b/] },
  { re: /\$2\b|\b2\s*dollar\b|\btwo\s*dollar\b|\bdeuce\b|\bjefferson\b/i, kw: "$2", tokens: [/\$2\b/, /\b2\s*dollar\b/, /\btwo\b/] },
  { re: /\$1\b|\b1\s*dollar\b|\bone\s*dollar\b|\bsingle\b|\bwashington\b/i, kw: "$1", tokens: [/\$1\b/, /\b1\s*dollar\b/, /\bone\s*dollar\b/] },
];

function nbDetectDenom(q: string): DenomMatch | null {
  for (const d of DENOMS) {
    if (d.re.test(q)) {
      // conflictTokens = every OTHER denomination's $/word tokens.
      const conflictTokens: RegExp[] = DENOMS.filter((o) => o.kw !== d.kw).flatMap((o) => o.tokens);
      return { kw: d.kw, tokens: d.tokens, conflictTokens };
    }
  }
  return null;
}

interface Spec { keyword: string; match: RegExp[]; conflict?: RegExp; denomTokens: RegExp[]; denomConflictTokens: RegExp[]; year: number; }

function nbExtractYear(q: string): number {
  const m = String(q || "").match(/\b(18\d{2}|19\d{2}|20\d{2})\b/);
  return m ? parseInt(m[1], 10) : 0;
}

// Generic banknote title signal used when no explicit series/denom anchor is set.
const NB_ANY_NOTE = [/\b(?:federal\s*reserve|silver\s*certificate|gold\s*certificate|united\s*states\s*note|legal\s*tender|national\s*bank|note|bill|currency|paper\s*money)\b/i];

/** Build a disciplined banknote keyword + match/conflict spec from a raw query. */
export function buildSoldCompsQuery(query: string): Spec {
  const q = String(query || "").trim();
  const year = nbExtractYear(q);
  const denom = nbDetectDenom(q);

  // Note-type anchor (priority).
  for (const a of NB_SERIES_ANCHORS) {
    if (a.re.test(q)) {
      const kw = (year ? year + " " : "") + (denom ? denom.kw + " " : "") + a.kw;
      const match = [...a.match, ...(denom ? denom.tokens : [])];
      return {
        keyword: kw, match, conflict: a.conflict,
        denomTokens: denom ? denom.tokens : [], denomConflictTokens: denom ? denom.conflictTokens : [], year,
      };
    }
  }

  // Denomination only -> generic note.
  if (denom) {
    const kw = (year ? year + " " : "") + denom.kw + " Note";
    return {
      keyword: kw, match: [...NB_ANY_NOTE, ...denom.tokens],
      conflict: undefined, denomTokens: denom.tokens, denomConflictTokens: denom.conflictTokens, year,
    };
  }

  // Neither -> strip filler noise and use what's left (title filter still runs).
  const cleaned = q.replace(NB_FILLER_RE, " ").replace(/\s+/g, " ").trim();
  return {
    keyword: (year ? year + " " : "") + (cleaned || "US paper money"),
    match: NB_ANY_NOTE, conflict: undefined,
    denomTokens: [], denomConflictTokens: [], year,
  };
}

/** Return true if a title is clearly junk / not a real banknote. */
export function isJunkSoldCompsTitle(title: string | null | undefined): boolean {
  return NB_JUNK_RE.test(String(title || ""));
}

/** Filter sold-comps / eBay items by junk rejection + anchor/conflict match. */
export function filterSoldCompsItems<T extends { title?: string }>(items: T[], spec: Spec): T[] {
  const match = spec?.match ?? [];
  const conflict = spec?.conflict;
  const denomConflictTokens = spec?.denomConflictTokens ?? [];
  return (items || []).filter((it) => {
    const title = String(it?.title || "");
    if (!title) return false;
    if (NB_JUNK_RE.test(title)) return false;
    if (conflict && conflict.test(title)) return false;
    // Denomination conflict: a title naming a DIFFERENT explicit denomination
    // must be rejected (e.g. a $5 note in a $20 search). $x tokens are
    // word-boundary-anchored so $20 in "$2000" or $1 in "$100" won't false-hit.
    for (const dt of denomConflictTokens) {
      if (dt.test(title)) return false;
    }
    if (match.length === 0) return true;
    return match.some((re) => re.test(title));
  });
}
