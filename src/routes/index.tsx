import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import PricingSearch from "~/components/PricingSearch";
import PricingResults from "~/components/PricingResults";
import TierBadge from "~/components/TierBadge";
import { lookupNote } from "~/lib/api";
import type { TabbedLookupResult } from "~/lib/api";
import type { PriceResult } from "~/lib/pricing-engine";
import type { TierName } from "~/lib/tiers";

export const Route = createFileRoute("/")({
  component: Home,
});

const features = [
  {
    icon: "💵",
    title: "Real Sold Prices",
    description:
      "Actual eBay sold transaction prices via Sold-Comps. Know what notes really sell for, not just what sellers are asking.",
  },
  {
    icon: "🏦",
    title: "Greensheet Dealer Pricing",
    description:
      "Industry-standard CPG retail values by grade. Retail pricing for every major US banknote type.",
  },
  {
    icon: "🛒",
    title: "eBay Active Listings",
    description:
      "See what's listed right now. Compare asking prices against actual sold comps and dealer values in one view.",
  },
  {
    icon: "⚡",
    title: "Streamer-First Design",
    description:
      "Big numbers, dark mode, mobile-friendly. Glance at your phone and read the price instantly during a live broadcast.",
  },
  {
    icon: "🔍",
    title: "Comprehensive Search",
    description:
      "Search by note type, year, series, grade — whatever details you have. Three data sources queried in parallel.",
  },
  {
    icon: "📊",
    title: "Grade-by-Grade Breakdown",
    description:
      "See retail pricing for every grade from VG8 to GEM70. Compare low, mid, and high grade averages at a glance.",
  },
];

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Get started with basic eBay pricing data.",
    features: [
      "10 lookups per day",
      "eBay Active listings (3 comps)",
      "Dark mode display",
    ],
    cta: "Get Started",
    featured: false,
  },
  {
    name: "Pro",
    price: "$14.99",
    period: "/month",
    description: "For streamers who need dealer pricing data.",
    features: [
      "Unlimited lookups",
      "eBay Active + Greensheet CPG (20 comps)",
      "Grade-by-grade retail pricing",
    ],
    cta: "Subscribe",
    featured: true,
  },
  {
    name: "Premier",
    price: "$24.99",
    period: "/month",
    description: "All three data sources — real sold prices.",
    features: [
      "Unlimited lookups",
      "eBay Active + Greensheet + Sold Comps (20 each)",
      "Real eBay sold prices",
      "Priority support",
    ],
    cta: "Subscribe",
    featured: false,
  },
];

function Home() {
  const [searchResult, setSearchResult] = useState<TabbedLookupResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(
    () => (typeof document !== "undefined" ? document.cookie.split("; ").find(r => r.startsWith("cus_id="))?.split("=")[1] || null : null)
  );
  
  // Generate or retrieve a browser fingerprint for rate limiting
  const getFingerprint = (): string => {
    if (typeof document === "undefined") return "anon";
    const existing = document.cookie.split("; ").find(r => r.startsWith("fp="))?.split("=")[1];
    if (existing) return existing;
    const fp = "fp_" + Math.random().toString(36).substring(2, 15);
    document.cookie = `fp=${fp}; path=/; max-age=31536000; SameSite=Lax`;
    return fp;
  };
  
  const [fingerprint] = useState(() => getFingerprint());
  const [showSubscriberLogin, setShowSubscriberLogin] = useState(false);
  const [subEmail, setSubEmail] = useState("");
  const [subLoading, setSubLoading] = useState(false);
  const [tier, setTier] = useState<TierName>("free");
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const handleSubscribe = async (tierName: string) => {
    setCheckoutLoading(true);
    try {
      const refCode = document.cookie.split("; ").find(r => r.startsWith("ref="))?.split("=")[1];
      const body: Record<string, string> = { tier: tierName };
      if (refCode) body.referralCode = decodeURIComponent(refCode);
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e) {
      console.error("Checkout failed:", e);
    } finally {
      setCheckoutLoading(false);
    }
  };

  // Handle return from Stripe checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const refCode = params.get("ref");
    
    // Store referral code in cookie for 30 days
    if (refCode) {
      document.cookie = `ref=${encodeURIComponent(refCode)}; path=/; max-age=2592000; SameSite=Lax`;
    }
    
    if (sessionId && params.get("subscribed") === "true") {
      fetch(`/api/session?session_id=${sessionId}`)
        .then(r => r.json())
        .then(data => {
          if (data.customerId) {
            document.cookie = `cus_id=${data.customerId}; path=/; max-age=31536000; SameSite=Lax`;
            setCustomerId(data.customerId);
            // Clean URL
            window.history.replaceState({}, "", "/");
          }
        })
        .catch(console.error);
    }
  }, []);

  // Fetch tier for subscribed users on page load
  useEffect(() => {
    if (!customerId) return;
    fetch(`/api/tier?customerId=${customerId}`)
      .then(r => r.json())
      .then(data => {
        if (data.tier) setTier(data.tier);
      })
      .catch(() => {}); // silent fail — tier will update on first search anyway
  }, [customerId]);

  const handleSubscriberLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subEmail) return;
    setSubLoading(true);
    try {
      const res = await fetch(`/api/session?email=${encodeURIComponent(subEmail)}`);
      const data = await res.json();
      if (data.customerId) {
        document.cookie = `cus_id=${data.customerId}; path=/; max-age=31536000; SameSite=Lax`;
        setCustomerId(data.customerId);
        setShowSubscriberLogin(false);
      } else {
        alert("No subscription found for that email. Try the email you used at checkout.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    setIsLoading(true);
    setHasSearched(true);

    try {
      const result = await lookupNote({ data: { query, fingerprint: customerId || fingerprint } }) as TabbedLookupResult;
      setSearchResult(result);
      if (result.tier) setTier(result.tier);
    } catch (e) {
      console.error("Search failed:", e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      {/* ───── Hero Section ───── */}
      <section className="relative flex min-h-[90dvh] flex-col items-center justify-center overflow-hidden px-4 pt-16 sm:pt-20 pb-12 sm:pb-16">
        {/* Background gradient */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950/40 via-transparent to-transparent" />

        {/* Decorative circles */}
        <div className="pointer-events-none absolute top-1/3 left-1/4 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="pointer-events-none absolute top-1/4 right-1/4 h-96 w-96 rounded-full bg-emerald-600/5 blur-3xl" />

        <div className="relative z-10 flex flex-col items-center gap-8 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-800/40 bg-emerald-950/30 px-4 py-1.5 text-xs font-medium text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Built for live streamers
          </div>

          {/* Headline */}
          <h1 className="max-w-4xl text-3xl font-extrabold tracking-tight sm:text-5xl lg:text-7xl">
            Price notes in seconds.
            <br />
            <span className="bg-gradient-to-r from-emerald-400 to-emerald-200 bg-clip-text text-transparent">
              Right on stream.
            </span>
          </h1>

          {/* Subheadline */}
          <p className="max-w-xl text-base text-gray-400 sm:text-xl">
            Real-time pricing from eBay active listings and Greensheet dealer
            data. Built for Whatnot, TikTok Live, and eBay Live streamers who
            can't wait.
          </p>

          {/* Search Demo — right in the hero */}
          <div className="mt-4 w-full max-w-2xl">
            <PricingSearch onSearch={handleSearch} isLoading={isLoading} />

            {/* Subscriber login prompt */}
            {!customerId && (
              <div className="mt-4 text-center">
                {!showSubscriberLogin ? (
                  <button
                    onClick={() => setShowSubscriberLogin(true)}
                    className="text-xs text-emerald-400/70 hover:text-emerald-400 underline underline-offset-2 transition-colors"
                  >
                    Already subscribed? Click here
                  </button>
                ) : (
                  <form onSubmit={handleSubscriberLogin} className="flex items-center justify-center gap-2">
                    <input
                      type="email"
                      placeholder="Your checkout email"
                      value={subEmail}
                      onChange={(e) => setSubEmail(e.target.value)}
                      className="rounded-lg border border-emerald-800/40 bg-gray-900 px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={subLoading}
                      className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                    >
                      {subLoading ? "..." : "Restore"}
                    </button>
                  </form>
                )}
              </div>
            )}
            {customerId && (
              <div className="mt-1 flex items-center justify-center gap-3">
                <TierBadge tier={tier} />
                <p className="text-xs text-green-400/80">
                  ✓ Subscribed
                </p>
              </div>
            )}
            <p className="mt-3 text-xs text-gray-600">
              Try it — type a note like &ldquo;1928 $2 Red
              Seal&rdquo;
            </p>
          </div>
        </div>
      </section>

      {/* ───── Search Results ───── */}
      {(hasSearched || searchResult) && (
        <section className="mx-auto max-w-7xl px-4 pb-16 sm:pb-24 sm:px-6 lg:px-8">
          {searchResult && !isLoading ? (
            <>
              <div className="mb-6 flex items-center justify-center gap-3">
                <TierBadge tier={tier} size="sm" />
                {searchResult.freeLookupsRemaining !== undefined && searchResult.freeLookupsRemaining >= 0 && (
                  <span className="text-xs text-gray-500">
                    {searchResult.freeLookupsRemaining} free lookups left today
                  </span>
                )}
              </div>
              <PricingResults result={searchResult} />
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
              <p className="text-gray-400">Searching auction data...</p>
            </div>
          )}
        </section>
      )}

      {/* ───── Features Section ───── */}
      <section className="border-t border-emerald-900/20 bg-gray-900/50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="text-2xl font-bold text-white sm:text-4xl">
              Everything you need to price on stream
            </h2>
            <p className="mt-4 text-base text-gray-400 sm:text-lg">
              No more frantically switching tabs while the auction clock ticks
              down.
            </p>
          </div>

          <div className="grid gap-6 sm:gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-2xl border border-gray-800 bg-gray-900/60 p-6 transition-all hover:border-emerald-800/40 hover:bg-gray-900"
              >
                <span className="text-3xl">{feature.icon}</span>
                <h3 className="mt-4 text-lg font-bold text-white">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── Pricing Tiers ───── */}
      <section className="py-16 sm:py-24" id="pricing">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="text-2xl font-bold text-white sm:text-4xl">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-base text-gray-400 sm:text-lg">
              Start free. Upgrade when you need more.
            </p>
          </div>

          <div className="mx-auto grid max-w-5xl gap-6 sm:gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-2xl border p-5 sm:p-8 ${
                  tier.featured
                    ? "border-emerald-500/50 bg-gradient-to-b from-emerald-950/20 to-gray-900 shadow-xl shadow-emerald-900/20"
                    : "border-gray-800 bg-gray-900/60"
                }`}
              >
                {tier.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-4 py-1 text-xs font-bold uppercase tracking-wider text-gray-950">
                    Most Popular
                  </div>
                )}
                <h3 className="text-xl font-bold text-white">{tier.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white">
                    {tier.price}
                  </span>
                  <span className="text-sm text-gray-400">{tier.period}</span>
                </div>
                <p className="mt-3 text-sm text-gray-400">
                  {tier.description}
                </p>
                <ul className="mt-6 space-y-3">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <svg
                        className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span className="text-sm text-gray-300">{feature}</span>
                    </li>
                  ))}
                </ul>
                {tier.name === "Premier" ? (
                  <button
                    onClick={() => handleSubscribe("premier")}
                    disabled={checkoutLoading}
                    className="mt-8 flex w-full items-center justify-center rounded-xl border border-emerald-500 py-3 text-sm font-bold text-emerald-400 transition-all hover:bg-emerald-500 hover:text-gray-950 disabled:opacity-60"
                  >
                    {checkoutLoading ? "Redirecting..." : "Subscribe"}
                  </button>
                ) : tier.name === "Pro" ? (
                  <button
                    onClick={() => handleSubscribe("pro")}
                    disabled={checkoutLoading}
                    className="mt-8 flex w-full items-center justify-center rounded-xl bg-emerald-500 py-3 text-sm font-bold text-gray-950 hover:bg-emerald-400 transition-all disabled:opacity-60"
                  >
                    {checkoutLoading ? "Redirecting..." : "Subscribe"}
                  </button>
                ) : (
                  <Link
                    to="/pricing"
                    className={`mt-8 flex w-full items-center justify-center rounded-xl py-3 text-sm font-bold transition-all border border-gray-700 text-gray-200 hover:border-emerald-500 hover:text-emerald-400`}
                  >
                    {tier.cta}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}