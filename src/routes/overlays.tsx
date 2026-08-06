import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createOverlay, listOverlays, deleteOverlay } from "~/routes/api/-overlays";
import type { OverlayRow } from "~/lib/overlays";
import type { TierName } from "~/lib/tiers";

export const Route = createFileRoute("/overlays")({
  component: OverlaysPage,
});

const MAX_OVERLAYS = 10;

function getCookie(name: string): string | null {
  return (
    typeof document !== "undefined"
      ? document.cookie.split("; ").find((r) => r.startsWith(name + "="))?.split("=")[1] || null
      : null
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };
  return (
    <button
      onClick={copy}
      className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 transition-colors"
    >
      {copied ? "Copied!" : "Copy OBS URL"}
    </button>
  );
}

function OverlaysPage() {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [tier, setTier] = useState<TierName | null>(null);
  const [loading, setLoading] = useState(true);

  // Sign-in (email restore) state — same flow as the home page.
  const [showSignIn, setShowSignIn] = useState(false);
  const [subEmail, setSubEmail] = useState("");
  const [subLoading, setSubLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  // Overlay management state.
  const [overlays, setOverlays] = useState<OverlayRow[]>([]);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isPremier = tier === "premier";

  useEffect(() => {
    setCustomerId(getCookie("cus_id"));
  }, []);

  // Fetch tier once we know the customer.
  useEffect(() => {
    if (!customerId) {
      setLoading(false);
      return;
    }
    fetch(`/api/tier?customerId=${encodeURIComponent(customerId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.tier) setTier(data.tier);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [customerId]);

  // Load overlays for Premier customers.
  useEffect(() => {
    if (!customerId || !isPremier) return;
    listOverlays({ data: { customerId } })
      .then((res) => {
        if (res?.overlays) setOverlays(res.overlays);
        else if (res?.error) setMessage({ type: "error", text: res.error });
      })
      .catch(() => setMessage({ type: "error", text: "Could not load overlays — try again." }));
  }, [customerId, isPremier]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subEmail) return;
    setSubLoading(true);
    setAuthError("");
    try {
      const res = await fetch(`/api/session?email=${encodeURIComponent(subEmail)}`);
      const data = await res.json();
      if (data.customerId) {
        document.cookie = `cus_id=${data.customerId}; path=/; max-age=31536000; SameSite=Lax`;
        setCustomerId(data.customerId);
        setShowSignIn(false);
        setLoading(true);
      } else {
        setAuthError("No subscription found for that email. Try the email you used at checkout.");
      }
    } catch {
      setAuthError("Could not reach the server. Please try again.");
    } finally {
      setSubLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    if (overlays.length >= MAX_OVERLAYS) {
      setMessage({ type: "error", text: `Overlay limit reached (max ${MAX_OVERLAYS}). Delete one first.` });
      return;
    }
    setCreating(true);
    setMessage(null);
    try {
      const res = await createOverlay({ data: { customerId: customerId!, query: trimmed } });
      if (res?.overlay) {
        setOverlays((prev) => [res.overlay, ...prev]);
        setQuery("");
        setMessage({ type: "success", text: "Overlay created! Add the OBS URL as a Browser Source." });
      } else if (res?.error) {
        setMessage({ type: "error", text: res.error });
      } else {
        setMessage({ type: "error", text: "Could not create overlay — try again." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error — try again." });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (token: string) => {
    if (!window.confirm("Delete this overlay? The OBS browser source will stop working.")) return;
    setDeleting(token);
    setMessage(null);
    try {
      const res = await deleteOverlay({ data: { customerId: customerId!, token } });
      if (res?.success) {
        setOverlays((prev) => prev.filter((o) => o.token !== token));
        setMessage({ type: "success", text: "Overlay deleted." });
      } else {
        setMessage({ type: "error", text: res?.error || "Could not delete overlay." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error — try again." });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="pt-16 sm:pt-20">
      <section className="border-b border-emerald-900/20 bg-gray-900/30 py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-3xl font-extrabold text-white sm:text-5xl">OBS Overlays</h1>
          <p className="mt-4 text-base text-gray-400 sm:text-lg">
            Put live pricing on stream. Create an overlay, copy the OBS browser-source URL, and
            pricing updates itself every 30 seconds. Premier feature.
          </p>
        </div>
      </section>

      <section className="py-12 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          {loading && (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
              <p className="text-gray-400">Loading…</p>
            </div>
          )}

          {/* Not signed in */}
          {!loading && !customerId && (
            <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-8 sm:p-12 text-center">
              <p className="text-4xl mb-4">🔑</p>
              <h2 className="text-xl font-bold text-white mb-2">Sign in to manage your overlays</h2>
              <p className="mx-auto max-w-md text-sm text-gray-400 mb-6">
                Already a subscriber? Sign in with the email you used at checkout.
              </p>

              {!showSignIn ? (
                <div className="flex flex-col items-center gap-3">
                  <button
                    onClick={() => setShowSignIn(true)}
                    className="inline-flex rounded-xl bg-emerald-500 px-6 py-3 font-bold text-gray-950 hover:bg-emerald-400 transition-colors"
                  >
                    Sign In
                  </button>
                  <Link
                    to="/pricing"
                    className="text-xs text-emerald-400/70 hover:text-emerald-400 underline underline-offset-2 transition-colors"
                  >
                    New here? View plans
                  </Link>
                </div>
              ) : (
                <form onSubmit={handleSignIn} className="mx-auto flex max-w-md flex-col gap-3">
                  <input
                    type="email"
                    required
                    placeholder="Your checkout email"
                    value={subEmail}
                    onChange={(e) => setSubEmail(e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={subLoading}
                    className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                  >
                    {subLoading ? "Signing in..." : "Restore Subscription"}
                  </button>
                  {authError && <p className="text-xs text-red-400">{authError}</p>}
                </form>
              )}
            </div>
          )}

          {/* Signed in but not Premier */}
          {!loading && customerId && !isPremier && (
            <div className="rounded-2xl border border-emerald-800/30 bg-gray-900/60 p-8 sm:p-12 text-center">
              <p className="text-4xl mb-4">📺</p>
              <h2 className="text-xl font-bold text-white mb-2">OBS Overlays require Premier</h2>
              <p className="mx-auto max-w-md text-sm text-gray-400 mb-6">
                Upgrade to Premier ($24.99/month) to create up to 10 live pricing overlays for
                OBS, Streamlabs, or any browser-source stream overlay.
              </p>
              <Link
                to="/pricing"
                className="inline-flex rounded-xl bg-emerald-500 px-6 py-3 font-bold text-gray-950 hover:bg-emerald-400 transition-colors"
              >
                View Plans
              </Link>
            </div>
          )}

          {/* Premier management UI */}
          {!loading && customerId && isPremier && (
            <div className="space-y-8">
              {/* Create form */}
              <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-8">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white">Create Overlay</h2>
                  <span className="text-xs font-medium text-gray-400">
                    {overlays.length} / {MAX_OVERLAYS} used
                  </span>
                </div>
                <p className="mb-4 text-sm text-gray-400">
                  Enter the note or currency you want to display, e.g.{" "}
                  <code className="text-emerald-400">1928 $2 Red Seal</code>.
                </p>
                <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g. 1928 $2 Red Seal"
                    maxLength={200}
                    className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={creating || !query.trim() || overlays.length >= MAX_OVERLAYS}
                    className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {creating ? "Creating..." : "Create Overlay"}
                  </button>
                </form>
                {message && (
                  <p className={`mt-3 text-xs ${message.type === "success" ? "text-green-400" : "text-red-400"}`}>
                    {message.text}
                  </p>
                )}
              </div>

              {/* Overlay list */}
              {overlays.length === 0 ? (
                <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-10 text-center">
                  <p className="text-3xl mb-3">🖥️</p>
                  <p className="text-sm text-gray-400">
                    No overlays yet. Create one above, then add the OBS URL as a Browser Source
                    in OBS (width 800 × height 300 works well).
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <h2 className="text-lg font-bold text-white">Your Overlays</h2>
                  {overlays.map((o) => {
                    const url = `${window.location.origin}/overlay/${o.token}`;
                    return (
                      <div
                        key={o.token}
                        className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-base font-bold text-white">{o.query}</p>
                            <p className="mt-0.5 text-xs text-gray-500">
                              Created {o.createdAt ? o.createdAt.replace("T", " ").substring(0, 16) : "just now"}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDelete(o.token)}
                            disabled={deleting === o.token}
                            className="rounded-lg border border-red-900/50 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-950/40 disabled:opacity-50 transition-colors"
                          >
                            {deleting === o.token ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <CopyButton text={url} />
                          <a href={`/overlay/panel/${o.token}`} target="_blank" rel="noreferrer" className="rounded-lg border border-emerald-700 px-3 py-1.5 text-sm font-medium text-emerald-400 hover:bg-emerald-950/50 transition-colors">Launch Panel ↗</a>
                        </div>
                        <p className="mt-2 text-[11px] text-gray-500">Add the OBS URL as a <span className="text-gray-300">Browser Source</span> (800 × 300 works well).</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
