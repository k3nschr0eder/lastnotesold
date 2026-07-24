import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="pt-16 sm:pt-20">
      <section className="border-b border-emerald-900/20 bg-gray-900/30 py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-extrabold text-white sm:text-5xl">About LastNoteSold</h1>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="prose prose-invert prose-emerald max-w-none space-y-8 text-gray-300">
            <p className="text-lg leading-relaxed">
              LastNoteSold is a real-time paper money pricing tool built for live
              streamers on Whatnot, TikTok Live, and eBay Live. We pull pricing from
              three independent data sources — eBay active listings, Greensheet dealer
              pricing, and Sold-Comps eBay sold prices — so you can price banknotes
              in seconds, right on stream.
            </p>
            <p className="text-lg leading-relaxed">
              Built by a collector, for collectors. No more frantically switching
              tabs while the auction clock ticks down.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
