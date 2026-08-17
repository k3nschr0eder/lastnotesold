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
  const [publishStatus, setPublishStatus] = useState<"idle" | "ok" | "fail">("idle");
  const [publishDetail, setPublishDetail] = useState("");
  const [showList, setShowList] = useState<string[]>([]);
  const [showListDraft, setShowListDraft] = useState("");
  const [lastClicked, setLastClicked] = useState<number | null>(null);
  const searchSeqRef = useRef(0);
  const SHOWLIST_KEY = `lsc-showlist-${token}`;
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SHOWLIST_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setShowList(parsed.map((s) => String(s)).filter(Boolean).slice(0, 100));
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SHOWLIST_KEY]);

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
    setPublishStatus("idle");
    setPublishDetail("");
    try {
      const resp = await fetch("/api/stream/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, event_type: "result", payload: { query: q, result: r } }),
      });
      if (resp.ok) {
        setPublishStatus("ok");
      } else {
        const body = await resp.text().catch(() => "(unreadable)");
        console.error("Publish failed", resp.status, body);
        setPublishStatus("fail");
        setPublishDetail(`HTTP ${resp.status}`);
      }
    } catch (e) {
      console.error("Publish failed (network)", e);
      setPublishStatus("fail");
      setPublishDetail("network error");
    }
  };

  const search = async (qOverride?: string) => {
    const q = (qOverride ?? query).trim();
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

  const persistShowList = (next: string[]) => {
    const clamped = next.slice(0, 100);
    setShowList(clamped);
    try {
      window.localStorage.setItem(SHOWLIST_KEY, JSON.stringify(clamped));
    } catch {}
  };
  const handleAddShowList = () => {
    const entries = showListDraft
      .split(/\r?\n/)
      .map((s) => s.trim().slice(0, 140))
      .filter(Boolean)
      .slice(0, 100);
    if (!entries.length) return;
    persistShowList([...showList, ...entries]);
    setShowListDraft("");
  };
  const handleRemoveShowList = (i: number) => {
    persistShowList(showList.filter((_, idx) => idx !== i));
  };
  const handleMoveShowList = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= showList.length) return;
    const next = [...showList];
    [next[i], next[j]] = [next[j], next[i]];
    persistShowList(next);
  };
  const handleClickEntry = (entry: string, i: number) => {
    setLastClicked(i);
    setQuery(entry);
    search(entry);
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
            onClick={() => search()}
            className="rounded-xl bg-emerald-500 px-5 font-bold text-gray-950 disabled:opacity-50"
          >
            {busy ? "Searching…" : "Search"}
          </button>
        </div>

        <section className="mt-6 rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-emerald-400">Show List</h2>
            <span className="text-xs text-gray-500">{showList.length}/100</span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Pre-load your lineup before the show — click a note anytime to search it and push it to the overlay.
          </p>
          <textarea
            rows={2}
            value={showListDraft}
            onChange={(e) => setShowListDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleAddShowList();
              }
            }}
            placeholder={"One note per line — e.g.\n1928 $2 Legal Tender\n1953B $5 Silver Certificate"}
            className="mt-3 w-full resize-y rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          />
          <button
            onClick={handleAddShowList}
            disabled={!showListDraft.trim()}
            className="mt-2 rounded-lg bg-emerald-500 px-4 py-1.5 text-sm font-bold text-gray-950 disabled:opacity-40"
          >
            Add to Show List
          </button>
          {showList.length > 0 ? (
            <ol className="mt-3 flex flex-col gap-1.5">
              {showList.map((entry, i) => (
                <li
                  key={`${i}-${entry}`}
                  className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 ${
                    lastClicked === i
                      ? "border-emerald-500 bg-emerald-900/40"
                      : "border-gray-800 bg-gray-950/60"
                  }`}
                >
                  <button
                    onClick={() => handleClickEntry(entry, i)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    title="Click to search and push to the overlay"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-800 text-[11px] font-bold text-emerald-400">
                      {i + 1}
                    </span>
                    <span className="truncate text-sm text-gray-200">{entry}</span>
                    {lastClicked === i && (
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-emerald-400">last</span>
                    )}
                  </button>
                  <span className="flex shrink-0 items-center gap-0.5">
                    <button
                      disabled={i === 0}
                      onClick={() => handleMoveShowList(i, -1)}
                      title="Move up"
                      className="rounded px-1.5 text-gray-400 hover:text-white disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      disabled={i === showList.length - 1}
                      onClick={() => handleMoveShowList(i, 1)}
                      title="Move down"
                      className="rounded px-1.5 text-gray-400 hover:text-white disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => handleRemoveShowList(i)}
                      title="Remove"
                      className="rounded px-1.5 text-gray-400 hover:text-red-400"
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-xs text-gray-600">No notes queued yet — add your lineup before the show.</p>
          )}
        </section>

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

        {publishStatus === "ok" && (
          <p className="mt-2 text-center text-xs text-emerald-500">Published ✓</p>
        )}
        {publishStatus === "fail" && (
          <p className="mt-2 text-center text-xs text-red-400">Publish failed ({publishDetail || "unknown"})</p>
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
