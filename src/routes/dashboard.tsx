import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    title: "OBS Overlay - LastNoteSold",
    meta: [
      { name: "description", content: "Manage your LastNoteSold overlays, referrals, and account links." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [tier, setTier] = useState<"free" | "pro" | "premier" | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginMessage, setLoginMessage] = useState("");

  useEffect(() => {
    const cid = document.cookie.split("; ").find((row) => row.startsWith("cus_id="))?.split("=")[1] || null;
    setCustomerId(cid);
    if (cid) {
      fetch(`/api/tier?customerId=${encodeURIComponent(cid)}`)
        .then((response) => response.json())
        .then((data) => setTier(data.tier || "free"))
        .catch(() => setTier("free"));
    }
  }, []);

  const restoreSession = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setLoginLoading(true);
    setLoginMessage("");
    try {
      const response = await fetch(`/api/session?email=${encodeURIComponent(email.trim())}`);
      const data = await response.json();
      if (data.customerId) {
        document.cookie = `cus_id=${data.customerId}; path=/; max-age=31536000; SameSite=Lax`;
        setCustomerId(data.customerId);
        setLoginOpen(false);
        setEmail("");
        const tierResponse = await fetch(`/api/tier?customerId=${encodeURIComponent(data.customerId)}`);
        const tierData = await tierResponse.json();
        setTier(tierData.tier || "free");
      } else {
        setLoginMessage("No subscription found for that email. Try the email used at checkout.");
      }
    } catch {
      setLoginMessage("Unable to sign in right now. Please try again.");
    } finally {
      setLoginLoading(false);
    }
  };

  const overlayLabel = !customerId ? "Sign in to manage →" : tier === "premier" ? "Manage Overlays →" : "Upgrade to Premier →";

  return (
    <div className="pt-16 sm:pt-20">
      <section className="border-b border-emerald-900/20 bg-gray-900/30 py-12 sm:py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-extrabold text-white sm:text-5xl">OBS Overlay</h1>
          <p className="mt-4 text-base text-gray-400 sm:text-lg">Your LastNoteSold tools and account shortcuts.</p>
        </div>
      </section>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
        <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="text-3xl" aria-hidden="true">📡</span>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-white">OBS Overlays</h2>
              <p className="mt-2 text-sm leading-6 text-gray-400">Create and manage OBS browser sources for your live stream. Show live prices on-screen while you sell.</p>
              {!customerId ? (
                <button onClick={() => setLoginOpen(true)} className="mt-5 inline-flex rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-gray-950 transition-colors hover:bg-emerald-400">{overlayLabel}</button>
              ) : tier === "premier" ? (
                <a href="/overlays" className="mt-5 inline-flex rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-gray-950 transition-colors hover:bg-emerald-400">{overlayLabel}</a>
              ) : (
                <Link to="/pricing" className="mt-5 inline-flex rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-gray-950 transition-colors hover:bg-emerald-400">{overlayLabel}</Link>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="text-3xl" aria-hidden="true">💰</span>
            <div>
              <h2 className="text-xl font-bold text-white">Referrals</h2>
              <p className="mt-2 text-sm leading-6 text-gray-400">Share LastNoteSold with fellow streamers and earn credits. Track your referral links and rewards.</p>
              <Link to="/referrals" className="mt-5 inline-flex rounded-xl border border-emerald-700 px-5 py-2.5 text-sm font-bold text-emerald-400 transition-colors hover:bg-emerald-950/50">Manage Referrals →</Link>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Quick Links</h2>
          <div className="flex flex-wrap gap-3">
            <Link to="/pricing" className="rounded-xl border border-gray-800 bg-gray-900/60 px-5 py-3 text-sm font-medium text-gray-300 hover:border-emerald-700 hover:text-emerald-400">Pricing →</Link>
            <Link to="/support" className="rounded-xl border border-gray-800 bg-gray-900/60 px-5 py-3 text-sm font-medium text-gray-300 hover:border-emerald-700 hover:text-emerald-400">Support →</Link>
          </div>
        </section>
      </main>

      {loginOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4" role="dialog" aria-modal="true" aria-labelledby="restore-title">
          <form onSubmit={restoreSession} className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between"><h2 id="restore-title" className="text-lg font-bold text-white">Sign in to LastNoteSold</h2><button type="button" onClick={() => setLoginOpen(false)} className="text-2xl text-gray-400 hover:text-white" aria-label="Close">×</button></div>
            <p className="mt-2 text-sm text-gray-400">Enter the email you used at checkout to restore your subscriber access.</p>
            <input autoFocus type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="mt-5 w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white outline-none focus:border-emerald-500" />
            {loginMessage && <p className="mt-3 text-sm text-red-400">{loginMessage}</p>}
            <button disabled={loginLoading} className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-3 font-bold text-gray-950 hover:bg-emerald-400 disabled:opacity-50">{loginLoading ? "Signing in…" : "Restore Access"}</button>
          </form>
        </div>
      )}
    </div>
  );
}
