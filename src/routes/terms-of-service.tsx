import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/terms-of-service")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="pt-16 sm:pt-20">
      <section className="border-b border-emerald-900/20 bg-gray-900/30 py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-extrabold text-white sm:text-5xl">Terms of Service</h1>
          <p className="mt-2 text-sm text-gray-500">Last updated: July 23, 2026</p>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="prose prose-invert prose-emerald max-w-none space-y-8 text-gray-300">
            <div>
              <h2 className="mb-3 text-xl font-bold text-white">1. Acceptance of Terms</h2>
              <p>
                By accessing or using LastNoteSold ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.
              </p>
            </div>

            <div>
              <h2 className="mb-3 text-xl font-bold text-white">2. Description of Service</h2>
              <p>
                LastNoteSold provides real-time paper money pricing data aggregated from third-party sources including eBay, Greensheet/CPG, and Sold-Comps. The Service is designed for live streamers and currency dealers who need quick pricing references during broadcasts.
              </p>
            </div>

            <div>
              <h2 className="mb-3 text-xl font-bold text-white">3. Subscription Tiers</h2>
              <p>The Service offers three tiers:</p>
              <ul className="mt-3 list-disc space-y-1 pl-5">
                <li><strong>Free</strong> — 10 lookups per day, eBay Active listings only (3 comps).</li>
                <li><strong>Pro</strong> ($14.99/month) — Unlimited lookups, eBay Active listings (20 comps) + Greensheet CPG data.</li>
                <li><strong>Premier</strong> ($24.99/month) — Unlimited lookups, all three data sources (20 comps each).</li>
              </ul>
              <p className="mt-3">
                Subscriptions auto-renew monthly until canceled. You may cancel anytime through the Stripe Customer Portal.
              </p>
            </div>

            <div>
              <h2 className="mb-3 text-xl font-bold text-white">4. Data Accuracy</h2>
              <p>
                Pricing data is provided "as is" from third-party sources. We do not guarantee the accuracy, completeness, or timeliness of any pricing information. The Service is a reference tool, not financial advice. Always verify prices before making purchase or sale decisions.
              </p>
            </div>

            <div>
              <h2 className="mb-3 text-xl font-bold text-white">5. Acceptable Use</h2>
              <p>You agree not to:</p>
              <ul className="mt-3 list-disc space-y-1 pl-5">
                <li>Exceed the lookup limits of your tier through automated means.</li>
                <li>Resell or redistribute pricing data without authorization.</li>
                <li>Use the Service for any illegal purpose.</li>
                <li>Attempt to circumvent rate limits or tier restrictions.</li>
              </ul>
            </div>

            <div>
              <h2 className="mb-3 text-xl font-bold text-white">6. Payment and Billing</h2>
              <p>
                Payments are processed securely through Stripe. By subscribing, you authorize recurring charges at the selected tier rate. Refunds are handled per Stripe's policies. Contact us for billing disputes.
              </p>
            </div>

            <div>
              <h2 className="mb-3 text-xl font-bold text-white">7. Limitation of Liability</h2>
              <p>
                LastNoteSold and its operators shall not be liable for any damages arising from the use or inability to use the Service, including but not limited to pricing errors, service interruptions, or data inaccuracies.
              </p>
            </div>

            <div>
              <h2 className="mb-3 text-xl font-bold text-white">8. Changes to Terms</h2>
              <p>
                We reserve the right to modify these terms at any time. Continued use of the Service after changes constitutes acceptance of the new terms.
              </p>
            </div>

            <div>
              <h2 className="mb-3 text-xl font-bold text-white">9. Contact</h2>
              <p>
                For questions about these terms, contact us at{" "}
                <a href="mailto:terms@lastnotesold.com" className="text-emerald-400 underline hover:text-emerald-300">
                  terms@lastnotesold.com
                </a>.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
