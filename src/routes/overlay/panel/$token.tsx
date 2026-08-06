import { useEffect, useRef, useState } from "react";
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
  { id: "ebay", label: "eBay Active", icon: "🛒" },
  { id: "greysheet", label: "Greensheet CPG", icon: "🏦" },
  { id: "soldcomps", label: "Sold Comps", icon: "💵" },
];

function unavailable(id: TabId, tier?: string, error?: boolean) {
  if (id === "greysheet" && error) {
    return (
      <div className="rounded-2xl border border-red-700/50 bg-red-950/30 p-8 text-center">
        <p className="mb-3 text-3xl">🏦</p>
        <p className="text-sm text-red-400 font-semibold">Greensheet CPG Temporarily Unavailable</p>
        <p className="mt-1 text-xs text-red-400/80">
          The Greensheet CPG API is currently down or rate-limited. Try again in a moment.
        </p>
      </div>
    );
  }
  if (id === "greysheet" && tier && tier !== "pro" && tier !== "premier") {
    return (
      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-8 text-center">
        <p className="mb-3 text-3xl">🏦</p>
        <p className="text-sm text-gray-400">Greensheet CPG requires a Pro or Premier subscription.</p>
      </div>
    );
  }
  if (id === "soldcomps" && tier !== "premier") {
    return (
      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-8 text-center">
        <p className="mb-3 text-3xl">💵</p>
        <p className="text-sm text-gray-400">Sold Comps requires a Premier subscription.</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-8 text-center">
      <p className="mb-3 text-3xl">{id === "ebay" ? "🔍" : id === "greysheet" ? "🏦" : "💵"}</p>
      <p className="text-sm text-gray-400">No {id === "greysheet" ? "Greensheet" : id === "soldcomps" ? "sold comps" : "eBay"} data found — try a broader search (e.g. just the note name without grade).</p>
    </div>
  );
}

function OverlayPanel() {
  const { token } = Route.useParams();
  const [overlay, setOverlay] = useState<OverlayRow | null>(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<TabbedLookupResult | null>(null);
  const [active, setActive] = useState<TabId>("ebay");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Connecting…");
  const [message, setMessage] = useState("");
  const searchSeqRef = useRef(0);

  useEffect(() => {
    getOverlay({ data: { token } })
      .then((o) => {
        if (o?.overlay) {
          setOverlay(o.overlay);
          setQuery(o.overlay.query || "");
          setStatus("Connected");
        } else {
          setStatus("Overlay not found");
        }
      })
      .catch(() => setStatus("Unable to connect"));
  }, [token]);

  const publishToOverlay = async (q: string, r: TabbedLookupResult) => {
    try {
      await fetch("/api/stream/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, event_type: "result", payload: { query: q, result: r } }),
      });
    } catch {
      // Best-effort — SSE delivery may catch up via poll
    }
  };

  const search = async () => {
    const q = query.trim();
    if (!q || q.length < 3) {
      setMessage("Enter at least 3 characters to search.");
      return;
    }
    setMessage("");
    setBusy(true);

    const seq = ++searchSeqRef.current;
    try {
      const r = (await lookupNote({
        data: { query: q, fingerprint: overlay?.customerId || token },
      })) as TabbedLookupResult;

      if (seq !== searchSeqRef.current) return;

      setResult(r);
      if (r.ebay) setActive("ebay");
      else if (r.greysheet) setActive("greysheet");
      else if (r.soldcomps) setActive("soldcomps");

      publishToOverlay(q, r);
    } catch {
      if (seq !== searchSeqRef.current) return;
      setMessage("Search failed — try again.");
    } finally {
      if (seq === searchSeqRef.current) setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      search();
    }
  };

  const source: PriceResult | null = result?.[active] || null;

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8 text-gray-100 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">
              OBS Overlay Panel
            </p>
            <h1 className="mt-2 text-2xl font-black sm:text-3xl">
              {overlay?.query || "Loading overlay…"}
            </h1>
          </div>
          <span className="rounded-full border border-emerald-800 bg-emerald-950/50 px-3 py-1 text-xs font-semibold text-emerald-400">
            ● {status}
          </span>
        </header>

        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-w-0 flex-1 rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-white outline-none focus:border-emerald-500"
            placeholder="Search a banknote — press Enter…"
          />
          <button
            disabled={busy || query.trim().length < 3}
            onClick={search}
            className="rounded-xl bg-emerald-500 px-5 font-bold text-gray-950 disabled:opacity-50"
          >
            {busy ? "Searching…" : "Search"}
          </button>
        </div>

        {result && (
          <>
            <nav className="mt-6 flex gap-2 overflow-x-auto pb-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActive(t.id)}
                  className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold ${
                    active === t.id
                      ? "border-emerald-500 bg-emerald-900/60 text-emerald-300"
                      : "border-gray-700 bg-gray-800/60 text-gray-400"
                  }`}
                >
                  {t.icon} {t.label}
                  <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">
                    {result[t.id]?.comps_count || 0}
                  </span>
                </button>
              ))}
            </nav>
            <section className="mt-2">
              {source ? (
                <SingleSourceResults result={source} />
              ) : active === "greysheet" && result.tier && (result.tier === "pro" || result.tier === "premier") && result.greysheet === null && !result.error ? (
                unavailable("greysheet", result.tier, true)
              ) : (
                unavailable(active, result.tier)
              )}
            </section>
          </>
        )}

        {busy && (
          <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-900/60 p-8 text-center">
            <p className="text-3xl animate-pulse">🔍</p>
            <p className="mt-3 text-sm text-gray-400">Searching…</p>
          </div>
        )}

        {message && (
          <p className="mt-4 text-center text-sm text-emerald-400">{message}</p>
        )}
        <p className="mt-8 text-center text-xs text-gray-600">
          Keep this panel open while OBS is live.
        </p>
      </div>
    </main>
  );
}
