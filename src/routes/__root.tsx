import "~/styles/app.css";
import { createRootRoute, HeadContent, Outlet } from "@tanstack/react-router";
import Header from "~/components/Header";
import Footer from "~/components/Footer";

export const Route = createRootRoute({
  head: () => ({
    title: "LastNoteSold — Real-Time Paper Money Pricing for Live Streamers",
    meta: [
      {
        name: "description",
        content:
          "Instant paper money pricing from Greensheet CPG and eBay. Built for Whatnot, TikTok Live, and eBay Live streamers.",
      },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <>
      <HeadContent />
      <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
        <Header />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
      </div>
    </>
  );
}
