import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  useRouterState,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import appCss from "~/styles/app.css?url";
import Header from "~/components/Header";
import Footer from "~/components/Footer";

const SITE_URL = "https://www.lastnotesold.com";
const OG_IMAGE = `${SITE_URL}/LastNoteSoldLogo.png`;
const SITE_TITLE = "LastNoteSold — Real-Time Paper Money Pricing for Live Streamers";
const SITE_DESC =
  "Instant paper money pricing from Greensheet CPG and eBay. Built for Whatnot, TikTok Live, and eBay Live streamers.";

export const Route = createRootRoute({
  head: () => ({
    title: SITE_TITLE,
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1.0, viewport-fit=cover",
      },
      { name: "description", content: SITE_DESC },
      { name: "robots", content: "index, follow" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { property: "og:title", content: SITE_TITLE },
      { property: "og:description", content: SITE_DESC },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:site_name", content: "LastNoteSold" },
      { property: "og:locale", content: "en_US" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: SITE_TITLE },
      { name: "twitter:description", content: SITE_DESC },
      { name: "twitter:image", content: OG_IMAGE },
      { name: "twitter:site", content: "@lastnotesold" },
    ],
    links: [
      { rel: "canonical", href: SITE_URL },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "LastNoteSold",
          url: SITE_URL,
          logo: OG_IMAGE,
          description: SITE_DESC,
          foundingDate: "2025",
          founder: {
            "@type": "Organization",
            name: "SixPackSouth, LLC",
          },
          sameAs: ["https://twitter.com/lastnotesold"],
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "LastNoteSold",
          url: SITE_URL,
          potentialAction: {
            "@type": "SearchAction",
            target: {
              "@type": "EntryPoint",
              urlTemplate: `${SITE_URL}/?q={search_term_string}`,
            },
            "query-input": "required name=search_term_string",
          },
        }),
      },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Admin and OBS overlay pages run with no site chrome (Header/Footer).
  const isBare = pathname.startsWith("/admin") || pathname.startsWith("/overlay/");

  return (
    <RootDocument isBare={isBare}>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children, isBare }: { children: ReactNode; isBare?: boolean }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        {/*
          Tailwind v4 emits custom @theme breakpoints BEFORE built-in named ones in
          compiled CSS (@media(min-width:1152px) precedes @media(min-width:48rem)),
          so at >=1152px the later md:h-10 rule wins the cascade and the header logo
          would render 40px instead of 48px (tblg:h-12). This inline fallback
          re-declares the tblg: rules AFTER the stylesheet link so the cascade favors
          tblg at >=1152px. Keep in sync with Header.tsx tblg usage.
          NOTE: do NOT add plain (unprefixed) display/height utilities here — they
          would override responsive variants elsewhere in the app (e.g. admin's
          `hidden lg:block`). Only the tblg block + body colors are safe.
        */}
        <style dangerouslySetInnerHTML={{ __html: `
          body{background-color:#0a0a0f;color:#e5e5e5;margin:0;font-family:system-ui,sans-serif}
          @media(min-width:1152px){.tblg\\:flex{display:flex}.tblg\\:hidden{display:none}.tblg\\:h-12{height:48px}.tblg\\:h-16{height:64px}.tblg\\:h-20{height:80px}.tblg\\:px-8{padding-left:32px;padding-right:32px}.tblg\\:top-\\[calc\\(5rem\\+1px\\)\\]{top:calc(5rem + 1px)}}
        `}} />
      </head>
      <body className="min-h-screen bg-gray-950 text-gray-100">
        <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
          {!isBare && <Header />}
          <main className="flex-1">
            {children}
          </main>
          {!isBare && <Footer />}
        </div>
        <Scripts />
      </body>
    </html>
  );
}
