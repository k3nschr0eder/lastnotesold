import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import ReferralWidget from "~/components/ReferralWidget";

function CustomCodeForm({ customerId, currentCode, onSaved }: {
  customerId: string;
  currentCode: string;
  onSaved: (newCode: string) => void;
}) {
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
        body: JSON.stringify({ customerId, code: trimmed }),
      });
      const data = await r.json();
      if (data.success) {
        setMessage({ type: "success", text: `Code set to ${data.code}!` });
        onSaved(data.code);
      } else {
        setMessage({ type: "error", text: data.error || "Failed to set code." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error. Try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
      <h3 className="text-sm font-semibold text-white mb-1">Custom Referral Code</h3>
      <p className="text-xs text-gray-400 mb-3">
        Set a custom code like <code className="text-emerald-400">MYCODE</code> — then share <code className="text-emerald-400">lastnotesold.com/MYCODE</code>
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={currentCode}
          maxLength={20}
          className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 font-mono tracking-widest focus:border-emerald-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={saving || !code.trim()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving..." : "Set Code"}
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

interface ReferralStats {
  code: string;
  clicks: number;
  conversions: number;
  earned: number;
  monthlyConversions: number;
  monthlyLimit: number;
  remainingThisMonth: number;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };
  return (
    <button
      onClick={copy}
      className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 transition-colors"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function ReferralsPage() {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const cid = document.cookie
      .split("; ")
      .find(r => r.startsWith("cus_id="))
      ?.split("=")[1] || null;
    setCustomerId(cid);
  }, []);

  useEffect(() => {
    if (!customerId) {
      setLoading(false);
      return;
    }

    fetch(`/api/referral?customerId=${customerId}&stats=true`)
      .then(r => r.json())
      .then(data => {
        if (data.stats) {
          setStats({
            code: data.stats.code || "",
            clicks: data.stats.clicks || 0,
            conversions: data.stats.conversions || 0,
            earned: parseFloat(data.stats.bountyEarnedDollars || "0"),
            monthlyConversions: data.stats.monthlyConversions || 0,
            monthlyLimit: data.stats.monthlyLimit || 20,
            remainingThisMonth: data.stats.remainingThisMonth || 0,
          });
        } else if (data.code) {
          setStats({
            code: data.code,
            clicks: 0,
            conversions: 0,
            earned: 0,
            monthlyConversions: 0,
            monthlyLimit: 20,
            remainingThisMonth: 20,
          });
        } else if (data.error) {
          setError(data.error);
        }
      })
      .catch(() => setError("Referral system is being set up — check back soon."))
      .finally(() => setLoading(false));
  }, [customerId]);

  const isSubscriber = stats !== null && !error;
  const isLoggedIn = !!customerId;

  return (
    <div className="pt-16 sm:pt-20">
      <section className="border-b border-emerald-900/20 bg-gray-900/30 py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-3xl font-extrabold text-white sm:text-5xl">
            Referrals
          </h1>
          <p className="mt-4 text-base text-gray-400 sm:text-lg">
            Share LastNoteSold and earn $2 for Pro referrals and $5 for Premier referrals.
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
                <span>Share your unique referral link with fellow banknote streamers and dealers.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-900/50 text-xs font-bold text-emerald-400">2</span>
                <span>When they click your link and sign up for any paid plan, you earn a bounty — $2 for Pro, $5 for Premier.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-900/50 text-xs font-bold text-emerald-400">3</span>
                <span>Bounties are tracked here and paid out by the LastNoteSold team.</span>
              </li>
            </ol>
          </div>

          {/* Subscriber with stats */}
          {!loading && isSubscriber && (
            <div className="space-y-8">
              <ReferralWidget
                code={stats!.code}
                conversions={stats!.conversions}
                earned={stats!.earned}
                monthlyConversions={stats!.monthlyConversions}
                monthlyLimit={stats!.monthlyLimit}
                remainingThisMonth={stats!.remainingThisMonth}
              />

              <CustomCodeForm
                customerId={customerId!}
                currentCode={stats!.code}
                onSaved={(newCode) => setStats({ ...stats!, code: newCode })}
              />

              {/* Stats Cards */}
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
                <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 sm:p-6 text-center">
                  <p className="text-2xl sm:text-3xl mb-2">👆</p>
                  <p className="text-2xl sm:text-3xl font-bold text-white">{stats!.clicks.toLocaleString()}</p>
                  <p className="mt-1 text-xs sm:text-sm text-gray-400">Total Clicks</p>
                </div>
                <div className="rounded-2xl border border-green-900/50 bg-green-950/20 p-4 sm:p-6 text-center">
                  <p className="text-2xl sm:text-3xl mb-2">✅</p>
                  <p className="text-2xl sm:text-3xl font-bold text-green-400">{stats!.conversions.toLocaleString()}</p>
                  <p className="mt-1 text-xs sm:text-sm text-gray-400">Conversions</p>
                </div>
                <div className="rounded-2xl border border-emerald-800/30 bg-emerald-950/20 p-4 sm:p-6 text-center">
                  <p className="text-2xl sm:text-3xl mb-2">💰</p>
                  <p className="text-2xl sm:text-3xl font-bold text-emerald-400">${stats!.earned.toLocaleString()}</p>
                  <p className="mt-1 text-xs sm:text-sm text-gray-400">Total Earned</p>
                </div>
                <div className="rounded-2xl border border-emerald-800/30 bg-emerald-950/20 p-4 sm:p-6 text-center">
                  <p className="text-2xl sm:text-3xl mb-2">📊</p>
                  <p className="text-2xl sm:text-3xl font-bold text-emerald-400">{stats!.remainingThisMonth}</p>
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
