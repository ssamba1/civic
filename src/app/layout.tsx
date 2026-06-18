import type { Metadata, Viewport } from "next";
import {
  Cormorant_Garamond,
  Hanken_Grotesk,
  JetBrains_Mono,
  Newsreader,
} from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { BottomTabBar } from "@/components/resident/bottom-tab-bar";

// No-flash theme init. Runs synchronously before the body paints, so the
// correct theme class is on <html> from the first frame. Default is dark
// (matches the server-rendered `dark` class → zero flash for the common case);
// only a stored "light" preference removes it. Kept tiny + dependency-free;
// the React store (lib/theme.ts) takes over after hydration.
const THEME_INIT = `(function(){try{var t=localStorage.getItem('civic.theme');if(t==='light'){document.documentElement.classList.remove('dark');}else{document.documentElement.classList.add('dark');}}catch(e){}})();`;

// Force every route to render per-request. Our CSP (src/proxy.ts) uses a
// per-request nonce with 'strict-dynamic'; statically prerendered HTML is baked
// at build time with no nonce, so its inline hydration scripts would be blocked
// at runtime (the request's nonce can't match build-time HTML). Dynamic
// rendering lets Next stamp the live nonce onto every page's inline scripts.
export const dynamic = "force-dynamic";

// Body / UI — humanist grotesk, warmer and more characterful than the
// default Geist/Inter that reads as generic AI output.
const sans = Hanken_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
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
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
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
            is a static constant; nonce-gated under the prod CSP. */}
        <script nonce={nonce}>{THEME_INIT}</script>
        <div className="page-enter flex flex-1 flex-col">{children}</div>
        <BottomTabBar />
      </body>
    </html>
  );
}
