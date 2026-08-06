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
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
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
          so at >=1152px the later md: rule wins the cascade (logo was 40px not 48px).
          This inline fallback re-declares all tblg: rules AFTER the stylesheet link
          so the cascade favors tblg at >=1152px. Keep in sync with Header.tsx tblg usage.
        */}
        <style dangerouslySetInnerHTML={{ __html: `
          :root{--tw-translate-x:0;--tw-translate-y:0;--tw-rotate:0;--tw-skew-x:0;--tw-skew-y:0;--tw-scale-x:1;--tw-scale-y:1}
          body{background-color:#0a0a0f;color:#e5e5e5;margin:0;font-family:system-ui,sans-serif}
          .bg-gray-950{background-color:#0a0a0f}.bg-gray-950\\/90{background-color:rgb(10 10 15 / .9)}
          .text-gray-100{color:#f3f4f6}.text-gray-300{color:#d1d5db}.text-gray-400{color:#9ca3b8}
          .text-emerald-400{color:#34d399}.text-white{color:#fff}
          .flex{display:flex}.flex-col{flex-direction:column}.items-center{align-items:center}
          .justify-center{justify-content:center}.justify-between{justify-content:space-between}
          .hidden{display:none}.fixed{position:fixed}.absolute{position:absolute}
          .top-0{top:0}.left-0{left:0}.right-0{right:0}.inset-0{inset:0}.z-40{z-index:40}.z-50{z-index:50}
          .h-8{height:32px}.h-10{height:40px}.h-12{height:48px}.h-14{height:56px}.h-16{height:64px}
          .min-h-screen{min-height:100vh}.w-full{width:100%}.w-auto{width:auto}
          .max-w-7xl{max-width:1280px}.mx-auto{margin-left:auto;margin-right:auto}
          .px-3{padding-left:12px;padding-right:12px}.px-6{padding-left:24px;padding-right:24px}
          .py-3{padding-top:12px;padding-bottom:12px}.pt-16{padding-top:64px}.pb-4{padding-bottom:16px}
          .gap-2{gap:8px}.gap-5{gap:20px}.gap-6{gap:24px}
          .rounded-lg{border-radius:8px}.border{border-width:1px}.border-b{border-bottom-width:1px}
          .border-emerald-900\\/30{border-color:rgb(6 78 59 / .3)}.border-gray-800\\/50{border-color:rgb(31 41 55 / .5)}
          .font-bold{font-weight:700}.font-medium{font-weight:500}.font-semibold{font-weight:600}
          .text-sm{font-size:14px}.text-base{font-size:16px}.text-xl{font-size:20px}
          .text-2xl{font-size:24px}.text-4xl{font-size:36px}.text-center{text-align:center}
          .transition-colors{transition-property:color,background-color}.object-contain{object-fit:contain}
          .flex-shrink-0{flex-shrink:0}.shrink-0{flex-shrink:0}.overflow-x-auto{overflow-x:auto}
          .shadow-lg{box-shadow:0 10px 15px -3px rgb(0 0 0 / .1)}.shadow-2xl{box-shadow:0 25px 50px -12px rgb(0 0 0 / .25)}
          .backdrop-blur-md{backdrop-filter:blur(12px)}.backdrop-blur-sm{backdrop-filter:blur(4px)}
          .bg-black\\/60{background-color:rgb(0 0 0 / .6)}.bg-gray-950\\/95{background-color:rgb(10 10 15 / .95)}
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
