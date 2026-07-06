import type { Metadata, Viewport } from "next";
import {
  Cormorant_Garamond,
  Inter,
  JetBrains_Mono,
  Newsreader,
} from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import AssistantWidgetMount from "@/components/assistant/assistant-widget-mount";
import { BottomTabBar } from "@/components/resident/bottom-tab-bar";
import { HELP_ASSISTANT } from "@/lib/ai/config";

// No-flash theme init. Runs synchronously before the body paints, so the
// correct theme class is on <html> from the first frame. Default is dark
// (matches the server-rendered `dark` class → zero flash for the common case);
// only a stored "light" preference removes it. Kept tiny + dependency-free;
// the React store (lib/theme.ts) takes over after hydration.
const THEME_INIT = `(function(){try{var t=localStorage.getItem('civic.theme');if(t==='light'){document.documentElement.classList.remove('dark');}else{document.documentElement.classList.add('dark');}}catch(e){}})();`;

// Registers public/sw.js (precache + offline fallback, see that file) once the
// page has finished loading, so registration never competes with the initial
// paint. PRODUCTION ONLY: sw.js serves /_next/static/ and *.js cache-first,
// which is safe in prod (chunks are content-hashed, immutable) but poison in
// dev — Turbopack keeps chunk names stable across edits, so a dev browser that
// ever installed the SW replays its first-cached bundle through every reload
// and silently ignores all later code changes. Dev therefore injects the
// inverse: unregister any worker and delete its caches, self-healing browsers
// that already latched a stale one.
const SW_REGISTER = `(function(){if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}})();`;
const SW_CLEANUP = `(function(){if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister();});}).catch(function(){});}if(window.caches&&caches.keys){caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k);});}).catch(function(){});}})();`;
const SW_SCRIPT =
  process.env.NODE_ENV === "production" ? SW_REGISTER : SW_CLEANUP;

// Force every route to render per-request. Our CSP (src/proxy.ts) uses a
// per-request nonce with 'strict-dynamic'; statically prerendered HTML is baked
// at build time with no nonce, so its inline hydration scripts would be blocked
// at runtime (the request's nonce can't match build-time HTML). Dynamic
// rendering lets Next stamp the live nonce onto every page's inline scripts.
export const dynamic = "force-dynamic";

// Body / UI — Inter, the enterprise product standard (Linear/Palantir/Stripe
// register). Carries headings, buttons, labels, body, and data across app chrome.
const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Display — newspaper serif. Carries the civic / public-record register and
// gives us a real italic for the accent move in headlines.
const display = Newsreader({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

// Hero face — high-contrast slim Garamond. Thin strokes + light weight give the
// headline a refined, slender voice distinct from the body display serif; real
// italic carries the accent line.
const hero = Cormorant_Garamond({
  variable: "--font-hero",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  display: "swap",
});

// Mono — eyebrow labels and metrics only.
const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Civic — AI-Powered Infrastructure Reporting",
    template: "%s | Civic",
  },
  description:
    "Report potholes, broken streetlights, and infrastructure issues. AI classifies and routes them to the right city crew instantly.",
  openGraph: {
    type: "website",
    siteName: "Civic",
    title: "Civic — AI-Powered Infrastructure Reporting",
    description:
      "Report potholes, broken streetlights, and infrastructure issues. AI classifies and routes them to the right city crew instantly.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Civic — AI-Powered Infrastructure Reporting",
    description: "Report infrastructure issues. AI classifies, city fixes.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e10" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Per-request CSP nonce (set by proxy.ts) — required for the inline theme
  // script to run under the prod `script-src 'nonce-…' 'strict-dynamic'` policy.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      // Default to dark so the server markup matches the no-flash script's
      // common path. suppressHydrationWarning: the script may flip this to the
      // stored "light" preference before React hydrates <html>.
      suppressHydrationWarning
      className={`dark ${sans.variable} ${display.variable} ${hero.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {/* No-flash theme init — children form (matches the repo's inline
            <style>{`…`}</style> idiom) so no dangerouslySetInnerHTML. THEME_INIT
            is a static constant; nonce-gated under the prod CSP.
            suppressHydrationWarning: browsers (Chrome 98+) clear the nonce
            content attribute after parse for CSP security, so the client reads
            nonce="" while the server HTML carries the real nonce — a benign
            mismatch React can't patch. The nonce is already consumed at parse
            time; nothing runtime depends on it. */}
        <script nonce={nonce} suppressHydrationWarning>
          {THEME_INIT}
        </script>
        <script nonce={nonce} suppressHydrationWarning>
          {SW_SCRIPT}
        </script>
        <div className="page-enter flex flex-1 flex-col">{children}</div>
        <BottomTabBar />
        {HELP_ASSISTANT ? <AssistantWidgetMount /> : null}
      </body>
    </html>
  );
}
