import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getOverlay } from "~/routes/api/-overlays";
import { lookupNote } from "~/lib/api";
import type { TabbedLookupResult } from "~/lib/api";
import type { OverlayRow } from "~/lib/overlays";
import type { PriceResult } from "~/lib/pricing-engine";
import SingleSourceResults from "~/components/SingleSourceResults";
import { gradeBreakdown } from "~/lib/grading";

export const Route = createFileRoute("/overlay/panel/$token")({ component: OverlayPanel });
type TabId = "ebay" | "greysheet" | "soldcomps";
const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: "ebay", label: "eBay Active", icon: "🛒" }, { id: "greysheet", label: "Greensheet CPG", icon: "🏦" }, { id: "soldcomps", label: "Sold Comps", icon: "💵" },
];
function unavailable(id: TabId, tier?: string) {
  const entitled = (id === "greysheet" && (tier === "pro" || tier === "premier")) || (id === "soldcomps" && tier === "premier");
  return <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-8 text-center"><p className="mb-3 text-3xl">{id === "ebay" ? "🔍" : id === "greysheet" ? "🏦" : "💵"}</p><p className="text-sm text-gray-400">{entitled ? "This data source is temporarily unavailable. Please try again." : id === "greysheet" ? "Greensheet CPG requires a Pro or Premier subscription." : id === "soldcomps" ? "Sold Comps requires a Premier subscription." : "Try a broader search — e.g. just the note name without grade."}</p></div>;
}
function OverlayPanel() {
  const { token } = Route.useParams();
  const [overlay, setOverlay] = useState<OverlayRow | null>(null); const [query, setQuery] = useState(""); const [result, setResult] = useState<TabbedLookupResult | null>(null); const [active, setActive] = useState<TabId>("ebay"); const [busy, setBusy] = useState(false); const [status, setStatus] = useState("Connecting…"); const [message, setMessage] = useState("");
  useEffect(() => { getOverlay({ data: { token } }).then(o => { if (o) { setOverlay(o); setQuery(o.query); setStatus("Connected"); } else setStatus("Overlay not found"); }).catch(() => setStatus("Unable to connect")); }, [token]);
  const search = async (e: React.FormEvent) => { e.preventDefault(); if (!query.trim()) return; setBusy(true); setMessage(""); try { const r = await lookupNote({ data: { query: query.trim(), fingerprint: overlay?.customerId || token } }) as TabbedLookupResult; setResult(r); setActive(r.ebay ? "ebay" : r.greysheet ? "greysheet" : "soldcomps"); } catch { setMessage("Search failed — try again."); } finally { setBusy(false); } };
  const push = () => { if (!result) return; const ch = new BroadcastChannel(`overlay-${token}`); ch.postMessage({ query: query.trim(), result }); ch.close(); setMessage("Pushed to overlay"); };
  const source: PriceResult | null = result?.[active] || null;
  return <main className="min-h-screen bg-gray-950 px-4 py-8 text-gray-100 sm:px-8"><div className="mx-auto max-w-3xl"><header className="mb-8 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-emerald-400">OBS Overlay Panel</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">{overlay?.query || "Loading overlay…"}</h1></div><span className="rounded-full border border-emerald-800 bg-emerald-950/50 px-3 py-1 text-xs font-semibold text-emerald-400">● {status}</span></header><form onSubmit={search} className="flex gap-2"><input value={query} onChange={e => setQuery(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-white outline-none focus:border-emerald-500" placeholder="Search a banknote…" /><button disabled={busy} className="rounded-xl bg-emerald-500 px-5 font-bold text-gray-950 disabled:opacity-50">{busy ? "Searching…" : "Search"}</button></form>{result && <><nav className="mt-6 flex gap-2 overflow-x-auto pb-1">{tabs.map(t => <button key={t.id} onClick={() => setActive(t.id)} className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold ${active === t.id ? "border-emerald-500 bg-emerald-900/60 text-emerald-300" : "border-gray-700 bg-gray-800/60 text-gray-400"}`}>{t.icon} {t.label}<span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">{result[t.id]?.comps_count || 0}</span></button>)}</nav><section className="mt-2">{source ? <SingleSourceResults result={source} /> : unavailable(active, result.tier)}</section><button onClick={push} className="mt-6 w-full rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white">Push to Overlay</button></>}{message && <p className="mt-4 text-center text-sm text-emerald-400">{message}</p>}<p className="mt-8 text-center text-xs text-gray-600">Keep this panel open while OBS is live.</p></div></main>;
}
