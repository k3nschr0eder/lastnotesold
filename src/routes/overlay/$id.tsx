import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getOverlay } from "~/routes/api/-overlays";
import type { TabbedLookupResult } from "~/lib/api";
import type { PriceResult } from "~/lib/pricing-engine";
import type { OverlayRow } from "~/lib/overlays";
import { gradeBreakdown } from "~/lib/grading";

export const Route = createFileRoute("/overlay/$id")({
  component: OverlayViewer,
});

const OVERLAY_STYLE = {
  "--ov-bg": "rgba(0,0,0,0)",
  "--ov-card-bg": "rgba(15,23,42,0.92)",
  "--ov-border": "rgba(16,185,129,0.20)",
  "--ov-text": "#f0fdf4",
  "--ov-muted": "#6ee7b7",
  "--ov-price": "#34d399",
  "--ov-label": "#6ee7b7",
  "--ov-chip-bg": "rgba(16,185,129,0.15)",
  "--ov-chip-text": "#34d399",
  "--ov-error": "#f87171",
  "--ov-error-bg": "rgba(239,68,68,0.10)",
} as const;

type TabId = "ebay" | "greysheet" | "soldcomps";

const TAB_LABELS: Record<TabId, string> = {
  ebay: "eBay Active",
  greysheet: "Greensheet CPG",
  soldcomps: "Sold Comps",
};

interface OverlayEvent {
  id: number;
  token: string;
  event_type: string;
  payload: { query?: string; result?: TabbedLookupResult };
  created_at: string;
}

const POLL_INTERVAL_MS = 3000;

function fmt(v: number): string {
  if (!v || Number.isNaN(v)) return "—";
  return "$" + v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtDec(v: number): string {
  if (!v || Number.isNaN(v)) return "—";
  return "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function avg(sales: { price: number }[]): string {
  if (!sales.length) return "—";
  return fmt(sales.reduce((a, b) => a + b.price, 0) / sales.length);
}

function high(sales: { price: number }[]): string {
  if (!sales.length) return "—";
  return fmt(Math.max(...sales.map((s) => s.price)));
}

function low(sales: { price: number }[]): string {
  if (!sales.length) return "—";
  return fmt(Math.min(...sales.map((s) => s.price)));
}

function OverlayCard({
  source,
  result,
  tier,
}: {
  source: string;
  result: PriceResult;
  tier?: TabId | string;
}) {
  const sales = result.recent_sales || [];
  const grades = gradeBreakdown(result);

  return (
    <div
      className="rounded-2xl p-6"
      style={{
        background: "var(--ov-card-bg)",
        border: "1px solid var(--ov-border)",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <div className="mb-4 flex items-center gap-2">
        <span
          className="inline-block rounded-full px-3 py-1 text-xs font-semibold"
          style={{
            background: "var(--ov-chip-bg)",
            color: "var(--ov-chip-text)",
          }}
        >
          {source}
        </span>
        <span className="text-xs" style={{ color: "var(--ov-muted)" }}>
          {sales.length} comp{sales.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div
        className="mb-1 text-4xl font-black tracking-tight"
        style={{ color: "var(--ov-price)" }}
      >
        {avg(sales)}
      </div>
      <div className="mb-4 text-xs" style={{ color: "var(--ov-muted)" }}>
        Average price
      </div>

      <div className="mb-4 flex gap-4">
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ov-muted)" }}>
            Low
          </div>
          <div className="text-lg font-bold" style={{ color: "var(--ov-text)" }}>
            {low(sales)}
          </div>
        </div>
        <div className="flex-1 text-right">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ov-muted)" }}>
            High
          </div>
          <div className="text-lg font-bold" style={{ color: "var(--ov-text)" }}>
            {high(sales)}
          </div>
        </div>
      </div>

      {(tier === "greysheet" || source.toLowerCase().includes("greensheet")) &&
        (grades.lowAvg != null || grades.midAvg != null || grades.highAvg != null) && (
          <div className="mb-4 rounded-xl p-3" style={{ background: "rgba(16,185,129,0.07)" }}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ov-muted)" }}>
              Grade Tiers
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--ov-label)" }}>
                  Low
                </div>
                <div className="text-sm font-bold" style={{ color: "var(--ov-text)" }}>
                  {grades.lowAvg != null ? fmtDec(grades.lowAvg) : "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--ov-label)" }}>
                  Mid
                </div>
                <div className="text-sm font-bold" style={{ color: "var(--ov-text)" }}>
                  {grades.midAvg != null ? fmtDec(grades.midAvg) : "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--ov-label)" }}>
                  High
                </div>
                <div className="text-sm font-bold" style={{ color: "var(--ov-text)" }}>
                  {grades.highAvg != null ? fmtDec(grades.highAvg) : "—"}
                </div>
              </div>
            </div>
          </div>
        )}

      <div className="text-[10px]" style={{ color: "var(--ov-muted)" }}>
        {result.note || source}
      </div>
    </div>
  );
}

function NoDataCard({ source, tab }: { source: string; tab: TabId }) {
  return (
    <div
      className="rounded-2xl p-6 text-center"
      style={{
        background: "var(--ov-card-bg)",
        border: "1px solid var(--ov-border)",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <div className="mb-2 text-xl">
        {tab === "ebay" ? "🛒" : tab === "greysheet" ? "🏦" : "💵"}
      </div>
      <div className="text-sm font-semibold" style={{ color: "var(--ov-muted)" }}>
        {tab === "greysheet" ? "No Greensheet Data" : tab === "soldcomps" ? "No Sold Comps" : "No eBay Data"}
      </div>
      <div className="mt-1 text-xs" style={{ color: "var(--ov-muted)", opacity: 0.7 }}>
        {source}
      </div>
    </div>
  );
}

function GreenSheetUnavailable() {
  return (
    <div
      className="rounded-2xl p-6 text-center"
      style={{
        background: "var(--ov-card-bg)",
        border: "1px solid var(--ov-error-bg)",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <div className="mb-2 text-xl">🏦</div>
      <div className="text-sm font-semibold" style={{ color: "var(--ov-error)" }}>
        Greensheet Unavailable
      </div>
      <div className="mt-1 text-xs" style={{ color: "var(--ov-muted)", opacity: 0.7 }}>
        CPG API is temporarily down
      </div>
    </div>
  );
}

function LoadingCard() {
  return (
    <div
      className="rounded-2xl p-8 text-center"
      style={{
        background: "var(--ov-card-bg)",
        border: "1px solid var(--ov-border)",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <div className="animate-pulse text-2xl">🔍</div>
      <div className="mt-3 text-sm" style={{ color: "var(--ov-muted)" }}>
        Waiting for search…
      </div>
      <div className="mt-2 text-xs" style={{ color: "var(--ov-muted)", opacity: 0.6 }}>
        Search from the panel to see results here
      </div>
    </div>
  );
}

function OverlayViewer() {
  const { id: token } = Route.useParams();
  const [overlay, setOverlay] = useState<OverlayRow | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [result, setResult] = useState<TabbedLookupResult | null>(null);
  const [active, setActive] = useState<TabId>("ebay");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  // Display mode — initialized to "box" for SSR/hydration match, then applied from
  // URL param in useEffect (mirrors LCS pattern). This avoids hydration mismatch.
  const [displayMode, setDisplayMode] = useState<"box" | "thin-line" | "text-only">("box");
  // Apply URL displayMode param after hydration — avoids SSR/client mismatch
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search).get("displayMode");
      if (p === "thin-line" || p === "text-only" || p === "box") {
        setDisplayMode(p);
      }
    } catch {}
  }, []);

  // Poll catch-up cursor — seeded from sessionStorage so the overlay never
  // replays events from before this browser session. Fresh load starts at 0
  // and replays the 5-min window; reloads resume from the last applied id.
  const getInitialLatestId = () => {
    try {
      const stored = sessionStorage.getItem('lns_oe_latest_' + token);
      return stored ? Math.max(0, parseInt(stored, 10) || 0) : 0;
    } catch {
      return 0;
    }
  };

  const latestEventIdRef = useRef(getInitialLatestId());
  const lastSearchIdRef = useRef(-1);

  const commitLatestId = (id: number) => {
    if (id > latestEventIdRef.current) {
      latestEventIdRef.current = id;
      try { sessionStorage.setItem('lns_oe_latest_' + token, String(id)); } catch {}
    }
  };

  const shouldAccept = (evt: OverlayEvent): boolean => {
    const payload = evt.payload;
    const sid =
      payload && typeof payload === "object" && "result" in payload
        ? (payload.result as any)?.search_id
        : payload && typeof payload === "object" && (payload as any)?.search_id;
    if (typeof sid === "number" && sid < lastSearchIdRef.current) return false;
    return true;
  };

  const markAccepted = (evt: OverlayEvent) => {
    const payload = evt.payload;
    const sid =
      payload && typeof payload === "object" && "result" in payload
        ? (payload.result as any)?.search_id
        : payload && typeof payload === "object" && (payload as any)?.search_id;
    if (typeof sid === "number" && sid > lastSearchIdRef.current) {
      lastSearchIdRef.current = sid;
    }
  };

  const applyEvent = (evt: OverlayEvent) => {
    if (!shouldAccept(evt)) return;
    markAccepted(evt);
    const payload = evt.payload;
    if (payload?.result) {
      setResult(payload.result);
      setQuery(payload.query || "");
      if (payload.result.ebay) setActive("ebay");
      else if (payload.result.greysheet) setActive("greysheet");
      else if (payload.result.soldcomps) setActive("soldcomps");
    }
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    getOverlay({ data: { token } })
      .then((o) => {
        if (cancelled) return;
        if (o?.overlay) {
          setOverlay(o.overlay);
          setQuery(o.overlay.query || "");
        } else {
          setNotFound(true);
          setLoading(false);
        }
      })
      .catch((e) => {
        console.error("Overlay init fetch failed", e);
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    let aborted = false;

    let eventSource: EventSource | null = null;

    const connectSSE = () => {
      if (aborted) return;
      const es = new EventSource(
        `/api/stream/events?token=${encodeURIComponent(token)}`,
      );
      eventSource = es;

      es.addEventListener("connected", (e) => {
        // Marker only — do NOT advance the poll cursor here.
        // Cursor advances only from events actually applied.
        try {
          const data = JSON.parse(e.data);
          // Apply displayMode from config if URL didn't explicitly set one
          if (data?.config?.displayMode) {
            const dm = data.config.displayMode;
            if ((dm === "thin-line" || dm === "text-only" || dm === "box") &&
                !new URLSearchParams(window.location.search).has("displayMode")) {
              setDisplayMode(dm);
            }
          }
        } catch {}
      });

      es.addEventListener("result", (e) => {
        try {
          const d = JSON.parse(e.data);
          const evt = { id: parseInt(e.lastEventId, 10) || 0, payload: d } as OverlayEvent;
          commitLatestId(evt.id);
          applyEvent(evt);
        } catch {}
      });

      es.onerror = () => {
        console.error("SSE connection error");
      };
    };

    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const pollTick = async () => {
      if (aborted) return;
      try {
        const after = latestEventIdRef.current;
        const resp = await fetch(
          `/api/stream/events?token=${encodeURIComponent(token)}&poll=1&after=${after}`,
        );
        if (!resp.ok) {
          console.error("Poll failed", resp.status, await resp.text().catch(() => ""));
          return;
        }
        const data = await resp.json();
        const events: OverlayEvent[] = data.events || [];
        for (const evt of events) {
          if (typeof evt.id === "number" && evt.id <= latestEventIdRef.current) continue;
          commitLatestId(evt.id);
          applyEvent(evt);
        }
        // Apply displayMode from poll config if URL didn't set one
        if (data.config?.displayMode) {
          const dm = data.config.displayMode;
          if ((dm === "thin-line" || dm === "text-only" || dm === "box") &&
              !new URLSearchParams(window.location.search).has("displayMode")) {
            setDisplayMode(dm);
          }
        }
        // Do NOT advance cursor from poll response metadata —
        // only from events actually applied above.
      } catch {}
    };

    connectSSE();
    pollTimer = setInterval(pollTick, POLL_INTERVAL_MS);

    return () => {
      aborted = true;
      if (eventSource) eventSource.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [token]);

  const displayModeClass = `obs-overlay dm-${displayMode}`;
  const isTop = displayMode === "thin-line" ? "dm-thin-line-top" : "";

  if (notFound) {
    return (
      <div
        className={`${displayModeClass} ${isTop} flex h-screen items-center justify-center p-8`}
        data-display-mode={displayMode}
        style={{ background: "var(--ov-bg)", fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        <div className="rounded-2xl p-8 text-center"
          style={{ background: "var(--ov-card-bg)", border: "1px solid var(--ov-border)" }}>
          <div className="text-4xl mb-3">⚠️</div>
          <div className="text-lg font-bold" style={{ color: "var(--ov-text)" }}>Overlay Not Found</div>
          <div className="mt-2 text-sm" style={{ color: "var(--ov-muted)" }}>
            This overlay token is invalid or has been deleted.
          </div>
        </div>
      </div>
    );
  }

  const activeResult: PriceResult | null = result?.[active] || null;
  const hasGreensheetError = result?.greysheet === null && result?.tier && (result.tier === "pro" || result.tier === "premier");

  return (
    <div
      className={`${displayModeClass} ${isTop} flex min-h-screen flex-col p-6`}
      data-display-mode={displayMode}
      style={{
        background: "var(--ov-bg)",
        fontFamily: "'Inter', system-ui, sans-serif",
        color: "var(--ov-text)",
      }}
    >
      <style>{`
        html, body, #root {
          margin: 0; padding: 0; overflow: hidden;
          background: transparent !important;
          cursor: none; user-select: none; -webkit-user-select: none;
        }
        .obs-overlay.dm-box {
          position: fixed; inset: 0;
          display: flex; align-items: flex-end; justify-content: flex-end;
          padding: 24px; pointer-events: none;
          font-family: 'Inter', system-ui, sans-serif;
        }
        .obs-overlay.dm-thin-line {
          position: fixed; left: 0; right: 0; bottom: 0;
          display: flex; align-items: center; justify-content: center;
          padding: 6px 16px; pointer-events: none;
          font-family: 'Inter', system-ui, sans-serif;
          background: var(--ov-bg); min-height: 36px; z-index: 9999;
        }
        .obs-overlay.dm-thin-line.dm-thin-line-top { bottom: auto; top: 0; }
        .obs-overlay.dm-text-only {
          position: fixed; right: 24px; bottom: 24px;
          pointer-events: none;
          font-family: 'Inter', system-ui, sans-serif; text-align: right;
        }
        .obs-overlay.dm-thin-line .ov-disconnected,
        .obs-overlay.dm-thin-line .ov-searching,
        .obs-overlay.dm-thin-line .ov-error {
          background: none; border: none; border-radius: 0;
          padding: 0; animation: none;
        }
        .obs-overlay.dm-text-only .ov-disconnected,
        .obs-overlay.dm-text-only .ov-searching,
        .obs-overlay.dm-text-only .ov-error,
        .obs-overlay.dm-text-only .ov-result-card {
          background: none !important; border: none !important;
          border-radius: 0 !important; padding: 0 !important;
          backdrop-filter: none !important; -webkit-backdrop-filter: none !important;
          min-width: auto !important;
        }
        .obs-overlay.dm-thin-line .ov-searching,
        .obs-overlay.dm-text-only .ov-searching {
          flex-direction: row; align-items: center; gap: 8px;
        }
      `}</style>
      {query && (
        <div className="mb-4">
          <h2
            className="text-lg font-bold"
            style={{ color: "var(--ov-text)" }}
          >
            {query}
          </h2>
        </div>
      )}

      {loading && !result && <LoadingCard />}

      {result && (
        <div className="grid grid-cols-3 gap-3">
          {(["ebay", "greysheet", "soldcomps"] as TabId[]).map((tab) => {
            const r = result[tab] as PriceResult | null;
            if (tab === "greysheet" && !r && hasGreensheetError) {
              return <GreenSheetUnavailable key={tab} />;
            }
            if (!r) {
              return <NoDataCard key={tab} source={TAB_LABELS[tab]} tab={tab} />;
            }
            return (
              <OverlayCard
                key={tab}
                source={TAB_LABELS[tab]}
                result={r}
                tier={tab}
              />
            );
          })}
        </div>
      )}

      <div
        className="mt-auto pt-4 text-center text-[10px]"
        style={{ color: "var(--ov-muted)", opacity: 0.5 }}
      >
        LastNoteSold.com — powered by Greensheet CPG &amp; eBay
      </div>
    </div>
  );
}
