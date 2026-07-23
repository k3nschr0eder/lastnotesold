import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
});

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Get started with basic eBay pricing data.",
    features: [
      "10 lookups per day",
      "eBay Active listings only",
      "3 most recent comps",
      "Dark mode display",
    ],
    cta: "Get Started",
    featured: false,
    tier: null,
  },
  {
    name: "Pro",
    price: "$14.99",
    period: "/month",
    description: "For streamers who need dealer pricing data.",
    features: [
      "Unlimited lookups",
      "eBay Active listings (20 comps)",
      "Full Greensheet CPG data",
      "Grade-by-grade retail pricing",
    ],
    cta: "Subscribe",
    featured: true,
    tier: "pro",
  },
  {
    name: "Premier",
    price: "$24.99",
    period: "/month",
    description: "All three data sources — the ultimate comp tool.",
    features: [
      "Unlimited lookups",
      "eBay Active listings (20 comps)",
      "Full Greensheet CPG data",
      "Sold Comps — real sold prices (20 comps)",
      "All three data sources",
      "Priority support",
    ],
    cta: "Subscribe",
    featured: false,
    tier: "premier",
  },
];

const faqs = [
  {
    q: "Can I cancel anytime?",
    a: "Yes. All plans are month-to-month with no annual commitments. Cancel anytime through the Stripe Customer Portal.",
  },
  {
    q: "Where does the pricing data come from?",
    a: "We pull real-time pricing from three sources: eBay Active listings, Greensheet/CPG dealer pricing (wholesale + retail by grade), and Sold-Comps (actual eBay sold transaction prices).",
  },
  {
    q: "How fast are the lookups?",
    a: "Most lookups complete in under 2 seconds. We query all data sources in parallel for speed.",
  },
  {
    q: "What notes are covered?",
    a: "All major US paper money types including Silver Certificates, Gold Certificates, Legal Tender Notes, Federal Reserve Notes, National Bank Notes, and more.",
  },
  {
    q: "Can I use this on my phone while streaming?",
    a: "Absolutely. The site is fully mobile-responsive and optimized for one-handed use — perfect for glancing at your phone mid-stream.",
  },
];

function PricingPage() {
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async (tier: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e) {
      console.error("Checkout failed:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-24">
      {/* Header */}
      <section className="border-b border-emerald-900/20 bg-gray-900/30 py-16">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-extrabold text-white sm:text-5xl">
            Pricing
          </h1>
          <p className="mt-4 text-lg text-gray-400">
            Start free. Upgrade when you need more power.
          </p>
        </div>
      </section>

      {/* Tiers */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-3">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-2xl border p-8 ${
                  tier.featured
                    ? "border-emerald-500/50 bg-gradient-to-b from-emerald-950/20 to-gray-900 shadow-xl shadow-emerald-900/20 lg:-mx-4 lg:scale-105"
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
                {tier.tier ? (
                  <button
                    onClick={() => handleSubscribe(tier.tier!)}
                    disabled={loading}
                    className={`mt-8 flex w-full items-center justify-center rounded-xl py-3 text-sm font-bold transition-all disabled:opacity-60 ${
                      tier.featured
                        ? "bg-emerald-500 text-gray-950 hover:bg-emerald-400"
                        : "border border-emerald-500 text-emerald-400 hover:bg-emerald-500 hover:text-gray-950"
                    }`}
                  >
                    {loading ? "Redirecting..." : tier.cta}
                  </button>
                ) : (
                  <Link
                    to="/"
                    className="mt-8 flex w-full items-center justify-center rounded-xl border border-gray-700 py-3 text-sm font-bold text-gray-200 transition-all hover:border-emerald-500 hover:text-emerald-400"
                  >
                    {tier.cta}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-emerald-900/20 bg-gray-900/50 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-12 text-center text-3xl font-bold text-white">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            {faqs.map((faq) => (
              <details
                key={faq.q}
                className="group rounded-xl border border-gray-800 bg-gray-900/60 p-5 transition-colors hover:border-gray-700"
              >
                <summary className="flex cursor-pointer items-center justify-between font-medium text-white">
                  {faq.q}
                  <svg
                    className="h-5 w-5 flex-shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-gray-400">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}