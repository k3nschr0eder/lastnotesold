import "~/styles/app.css";
import { createRootRoute, HeadContent, Outlet, useRouterState } from "@tanstack/react-router";
import Header from "~/components/Header";
import Footer from "~/components/Footer";

export const Route = createRootRoute({
  head: () => ({
    title: "LastNoteSold — Real-Time Paper Money Pricing for Live Streamers",
    meta: [
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1.0, viewport-fit=cover",
      },
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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = pathname.startsWith("/admin");

  return (
    <>
      <HeadContent />
      <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
        {!isAdmin && <Header />}
        <main className="flex-1">
          <Outlet />
        </main>
        {!isAdmin && <Footer />}
      </div>
    </>
  );
}
