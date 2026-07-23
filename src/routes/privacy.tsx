import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="pt-24">
      <section className="border-b border-emerald-900/20 bg-gray-900/30 py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-extrabold text-white">Privacy Policy</h1>
          <p className="mt-2 text-sm text-gray-500">Last updated: July 23, 2026</p>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="prose prose-invert prose-emerald max-w-none space-y-8 text-gray-300">
            <div>
              <h2 className="mb-3 text-xl font-bold text-white">1. Information We Collect</h2>
              <p>
                LastNoteSold ("we," "our," or "us") collects minimal information necessary to provide our paper money pricing service.
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5">
                <li><strong>Search queries</strong> — the note names, years, and grades you search for.</li>
                <li><strong>Usage data</strong> — anonymous lookup counts to enforce free tier limits.</li>
                <li><strong>Payment information</strong> — processed securely by Stripe. We do not store your credit card details.</li>
                <li><strong>Email address</strong> — if you subscribe, your email is stored by Stripe and used to identify your subscription.</li>
              </ul>
            </div>

            <div>
              <h2 className="mb-3 text-xl font-bold text-white">2. How We Use Your Information</h2>
              <ul className="list-disc space-y-1 pl-5">
                <li>To fulfill your search requests and display pricing data.</li>
                <li>To enforce free tier usage limits.</li>
                <li>To process subscriptions and manage your account.</li>
                <li>To improve the service based on aggregate usage patterns.</li>
              </ul>
            </div>

            <div>
              <h2 className="mb-3 text-xl font-bold text-white">3. Third-Party Services</h2>
              <p>
                We use the following third-party services to operate LastNoteSold:
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5">
                <li><strong>Stripe</strong> — payment processing.{" "}
                  <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline hover:text-emerald-300">
                    Stripe Privacy Policy
                  </a>
                </li>
                <li><strong>Vercel</strong> — hosting and infrastructure.</li>
                <li><strong>Greensheet/CPG</strong> — paper money pricing data.</li>
                <li><strong>Sold-Comps</strong> — eBay sold listing data.</li>
                <li><strong>eBay</strong> — active listing data via Browse API.</li>
              </ul>
            </div>

            <div>
              <h2 className="mb-3 text-xl font-bold text-white">4. Cookies</h2>
              <p>
                We use a single functional cookie to remember your subscription status and enforce free tier limits. No advertising or tracking cookies are used.
              </p>
            </div>

            <div>
              <h2 className="mb-3 text-xl font-bold text-white">5. Data Retention</h2>
              <p>
                Search queries are processed in real time and not permanently stored. Subscription data is retained while your account is active and deleted upon cancellation per Stripe's data processing terms.
              </p>
            </div>

            <div>
              <h2 className="mb-3 text-xl font-bold text-white">6. Your Rights</h2>
              <p>
                You may request deletion of your data by contacting us. Subscription data can be managed through the Stripe Customer Portal.
              </p>
            </div>

            <div>
              <h2 className="mb-3 text-xl font-bold text-white">7. Contact</h2>
              <p>
                For privacy inquiries, contact us at{" "}
                <a href="mailto:privacy@lastnotesold.com" className="text-emerald-400 underline hover:text-emerald-300">
                  privacy@lastnotesold.com
                </a>.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
