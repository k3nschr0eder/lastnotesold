import { useState, useEffect, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import ReferralWidget from "~/components/ReferralWidget";

interface CodeStat {
  code: string;
  active: boolean;
  clicks: number;
  conversions: number;
  earned: number;
  monthlyConversions: number;
  monthlyLimit: number;
  remainingThisMonth: number;
}

function CustomCodeForm({ customerId, oldCode, usedSlots, codeLimit, onSaved }: {
  customerId: string;
  oldCode?: string;
  usedSlots: number;
  codeLimit: number;
  onSaved: (newCode: string) => void;
}) {
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isRename = !!oldCode;
  const remaining = Math.max(0, codeLimit - usedSlots);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed || trimmed.length < 3) {
      setMessage({ type: "error", text: "Code must be at least 3 characters." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const r = await fetch("/api/referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          code: trimmed,
          ...(isRename ? { oldCode } : {}),
        }),
      });
      const data = await r.json();
      if (data.success) {
        setMessage({ type: "success", text: isRename ? `Code renamed to ${data.code}!` : `Code ${data.code} added!` });
        setCode("");
        onSaved(data.code);
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save code." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error. Try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
      <h3 className="text-sm font-semibold text-white mb-1">
        {isRename ? `Rename ${oldCode}` : "Add a Referral Code"}
      </h3>
      <p className="text-xs text-gray-400 mb-3">
        {isRename ? (
          <>Rename <code className="text-emerald-400">{oldCode}</code> — old links stop working, share the new one.</>
        ) : (
          <>
            Set a custom code like <code className="text-emerald-400">MYCODE</code> — then share{" "}
            <code className="text-emerald-400">lastnotesold.com/MYCODE</code>
            {codeLimit > 0 && (
              <> — {remaining} of {codeLimit} {remaining === 1 ? "slot" : "slots"} left.</>
            )}
          </>
        )}
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={isRename ? oldCode : "MYCODE"}
          maxLength={20}
          className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 font-mono tracking-widest focus:border-emerald-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={saving || !code.trim()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving..." : isRename ? "Rename" : "Add Code"}
        </button>
      </form>
      {message && (
        <p className={`mt-2 text-xs ${message.type === "success" ? "text-green-400" : "text-red-400"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

export const Route = createFileRoute("/referrals")({
  component: ReferralsPage,
});

function ReferralsPage() {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [codes, setCodes] = useState<CodeStat[]>([]);
  const [tier, setTier] = useState("free");
  const [codeLimit, setCodeLimit] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [pageMessage, setPageMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const cid = document.cookie
      .split("; ")
      .find(r => r.startsWith("cus_id="))
      ?.split("=")[1] || null;
    setCustomerId(cid);
  }, []);

  const loadStats = useCallback(async (cid: string) => {
    try {
      const r = await fetch(`/api/referral?customerId=${encodeURIComponent(cid)}&stats=true`);
      const data = await r.json();
      if (data.stats) {
        const s = data.stats;
        setCodes((s.codes || []).map((c: any) => ({
          code: c.code || "",
          active: s.codeActive ? s.codeActive[c.code] !== false : true,
          clicks: c.clicks || 0,
          conversions: c.conversions || 0,
          earned: parseFloat(c.bountyEarnedDollars || "0"),
          monthlyConversions: c.monthlyConversions || 0,
          monthlyLimit: c.monthlyLimit || 20,
          remainingThisMonth: c.remainingThisMonth || 0,
        })));
        setTier(s.tier || "free");
        setCodeLimit(s.codeLimit || 0);
        setError("");
      } else if (data.error) {
        setError(data.error);
      }
    } catch {
      setError("Referral system is being set up — check back soon.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!customerId) {
      setLoading(false);
      return;
    }
    loadStats(customerId);
  }, [customerId, loadStats]);

  const handleDelete = async (code: string) => {
    if (!window.confirm(`Delete referral code "${code}"? This cannot be undone.`)) return;
    setPageMessage(null);
    try {
      const r = await fetch("/api/referral-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, code }),
      });
      const data = await r.json();
      if (data.success) {
        setPageMessage({ type: "success", text: `Code ${code} deleted.` });
        setRenaming(null);
        if (customerId) loadStats(customerId);
      } else {
        setPageMessage({ type: "error", text: data.error || "Failed to delete code." });
      }
    } catch {
      setPageMessage({ type: "error", text: "Network error. Try again." });
    }
  };

  const handleDeactivate = async (code: string) => {
    if (!window.confirm(`Deactivate referral code "${code}"? It will stop accepting new referrals (clicks and conversions) until you re-activate it.`)) return;
    setPageMessage(null);
    try {
      const r = await fetch("/api/referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, code, action: "deactivate" }),
      });
      const data = await r.json();
      if (data.success) {
        setPageMessage({ type: "success", text: `Code ${data.code} deactivated.` });
        if (customerId) loadStats(customerId);
      } else {
        setPageMessage({ type: "error", text: data.error || "Failed to deactivate code." });
      }
    } catch {
      setPageMessage({ type: "error", text: "Network error. Try again." });
    }
  };
  const handleActivate = async (code: string) => {
    setPageMessage(null);
    try {
      const r = await fetch("/api/referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, code, action: "activate" }),
      });
      const data = await r.json();
      if (data.success) {
        setPageMessage({ type: "success", text: `Code ${data.code} is active again.` });
        if (customerId) loadStats(customerId);
      } else {
        setPageMessage({ type: "error", text: data.error || "Failed to re-activate code." });
      }
    } catch {
      setPageMessage({ type: "error", text: "Network error. Try again." });
    }
  };
  const handleSaved = (newCode: string) => {
    setRenaming(null);
    setPageMessage({ type: "success", text: `Code ${newCode} saved.` });
    if (customerId) loadStats(customerId);
  };

  // A subscriber is anyone with codes (legacy data) or an active Pro/Premier tier
  const isSubscriber = codes.length > 0 || tier === "pro" || tier === "premier";
  const isLoggedIn = !!customerId;
  const slotsRemaining = Math.max(0, codeLimit - codes.length);

  // Aggregate totals across all codes
  const totalClicks = codes.reduce((a, c) => a + c.clicks, 0);
  const totalConversions = codes.reduce((a, c) => a + c.conversions, 0);
  const totalEarned = codes.reduce((a, c) => a + c.earned, 0);
  const totalRemaining = codes.reduce((a, c) => a + c.remainingThisMonth, 0);

  return (
    <div className="pt-16 sm:pt-20">
      <section className="border-b border-emerald-900/20 bg-gray-900/30 py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-3xl font-extrabold text-white sm:text-5xl">
            Referrals
          </h1>
          <p className="mt-4 text-base text-gray-400 sm:text-lg">
            Share LastNoteSold and earn $2 for Pro referrals and $5 for Premier referrals.
            {tier === "premier" && <span className="block text-sm text-emerald-500 mt-1">Premier members get up to 3 referral codes.</span>}
          </p>
        </div>
      </section>

      <section className="py-12 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
              <p className="text-gray-400">Loading referral data...</p>
            </div>
          )}

          {/* How it works — always shown */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-8 mb-8">
            <h2 className="text-lg font-bold text-white mb-4">How It Works</h2>
            <ol className="space-y-3 text-sm text-gray-400">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-900/50 text-xs font-bold text-emerald-400">1</span>
                <span>Share your unique referral link(s) with fellow banknote streamers and dealers.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-900/50 text-xs font-bold text-emerald-400">2</span>
                <span>When they click your link and sign up for any paid plan, you earn a bounty — $2 for Pro, $5 for Premier.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-900/50 text-xs font-bold text-emerald-400">3</span>
                <span>Each code earns up to 20 conversions per month. Premier members can have up to 3 codes (60 conversions/month).</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-900/50 text-xs font-bold text-emerald-400">4</span>
                <span>Bounties are tracked here and paid out by the LastNoteSold team.</span>
              </li>
            </ol>
          </div>

          {/* Subscriber with stats */}
          {!loading && isSubscriber && (
            <div className="space-y-8">
              {pageMessage && (
                <p className={`rounded-lg border px-4 py-2 text-sm ${pageMessage.type === "success" ? "border-green-900/50 bg-green-950/20 text-green-400" : "border-red-900/50 bg-red-950/20 text-red-400"}`}>
                  {pageMessage.text}
                </p>
              )}

              {/* Per-code cards */}
              <ReferralWidget
                codes={codes}
                codeLimit={codeLimit}
                onDelete={handleDelete}
                onRename={(code) => setRenaming(code)}
                onDeactivate={handleDeactivate}
                onActivate={handleActivate}
              />

              {/* Rename form (when a card's Rename was clicked) */}
              {renaming && (
                <CustomCodeForm
                  key={renaming}
                  customerId={customerId!}
                  oldCode={renaming}
                  usedSlots={codes.length}
                  codeLimit={codeLimit}
                  onSaved={handleSaved}
                />
              )}

              {/* Add-new form (when slots remain) */}
              {!renaming && slotsRemaining > 0 && (
                <CustomCodeForm
                  customerId={customerId!}
                  usedSlots={codes.length}
                  codeLimit={codeLimit}
                  onSaved={handleSaved}
                />
              )}

              {/* Stats Cards — aggregate across all codes */}
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
                <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 sm:p-6 text-center">
                  <p className="text-2xl sm:text-3xl mb-2">👆</p>
                  <p className="text-2xl sm:text-3xl font-bold text-white">{totalClicks.toLocaleString()}</p>
                  <p className="mt-1 text-xs sm:text-sm text-gray-400">Total Clicks</p>
                </div>
                <div className="rounded-2xl border border-green-900/50 bg-green-950/20 p-4 sm:p-6 text-center">
                  <p className="text-2xl sm:text-3xl mb-2">✅</p>
                  <p className="text-2xl sm:text-3xl font-bold text-green-400">{totalConversions.toLocaleString()}</p>
                  <p className="mt-1 text-xs sm:text-sm text-gray-400">Conversions</p>
                </div>
                <div className="rounded-2xl border border-emerald-800/30 bg-emerald-950/20 p-4 sm:p-6 text-center">
                  <p className="text-2xl sm:text-3xl mb-2">💰</p>
                  <p className="text-2xl sm:text-3xl font-bold text-emerald-400">${totalEarned.toLocaleString()}</p>
                  <p className="mt-1 text-xs sm:text-sm text-gray-400">Total Earned</p>
                </div>
                <div className="rounded-2xl border border-emerald-800/30 bg-emerald-950/20 p-4 sm:p-6 text-center">
                  <p className="text-2xl sm:text-3xl mb-2">📊</p>
                  <p className="text-2xl sm:text-3xl font-bold text-emerald-400">{totalRemaining}</p>
                  <p className="mt-1 text-xs sm:text-sm text-gray-400">Remaining This Month</p>
                </div>
              </div>
            </div>
          )}

          {/* Not logged in — show program info + CTA */}
          {!loading && !isLoggedIn && (
            <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-8 sm:p-12 text-center mb-8">
              <p className="text-4xl mb-4">🔑</p>
              <h2 className="text-xl font-bold text-white mb-2">Sign in to see your referrals</h2>
              <p className="text-gray-400 mb-6">
                Already a Pro or Premier subscriber? Sign in with your checkout email on the home page to view your referral stats.
              </p>
              <a
                href="/"
                className="inline-flex rounded-xl bg-emerald-500 px-6 py-3 font-bold text-gray-950 hover:bg-emerald-400 transition-colors"
              >
                Go to Home
              </a>
            </div>
          )}

          {/* Logged in but not subscribed (or API error) */}
          {!loading && isLoggedIn && !isSubscriber && (
            <div className="rounded-2xl border border-emerald-800/30 bg-gray-900/60 p-8 sm:p-12 text-center mb-8">
              <p className="text-4xl mb-4">⭐</p>
              <h2 className="text-xl font-bold text-white mb-2">Pro or Premier Plan Required</h2>
              <p className="text-gray-400 mb-6">
                The referral program is available for Pro ($14.99/month) and Premier ($24.99/month) subscribers.
                Upgrade to start earning $2 (Pro) or $5 (Premier) for every person you refer.
              </p>
              <a
                href="/pricing"
                className="inline-flex rounded-xl bg-emerald-500 px-6 py-3 font-bold text-gray-950 hover:bg-emerald-400 transition-colors"
              >
                View Plans
              </a>
              {error && (
                <p className="mt-4 text-xs text-gray-500">{error}</p>
              )}
            </div>
          )}

          {/* Error state — only for non-auth errors */}
          {!loading && !isLoggedIn && error && (
            <div className="rounded-2xl border border-red-900/30 bg-red-950/20 p-8 text-center mb-8">
              <p className="text-red-400">{error}</p>
            </div>
          )}

        </div>
      </section>
    </div>
  );
}
