import type { Metadata, Viewport } from "next";
import {
  Cormorant_Garamond,
  Inter,
  JetBrains_Mono,
  Newsreader,
} from "next/font/google";
import "./globals.css";
import AssistantWidgetMount from "@/components/assistant/assistant-widget-mount";
import { BottomTabBar } from "@/components/resident/bottom-tab-bar";
import { HELP_ASSISTANT } from "@/lib/ai/config";
import { SW_CLEANUP, SW_REGISTER, THEME_INIT } from "@/lib/csp/inline-scripts";

// Both scripts are build-time constants allowlisted by SHA-256 hash in the
// prod CSP (src/proxy.ts + src/lib/csp/inline-scripts.ts), NOT by nonce — so
// this layout never reads headers() and routes with no dynamic data of their
// own (landing, /terms, /privacy, /offline) can statically prerender again
// (REVAMP_PLAN 2.5; the old force-dynamic + per-request nonce forced every
// route to SSR per request).
const SW_SCRIPT =
  process.env.NODE_ENV === "production" ? SW_REGISTER : SW_CLEANUP;

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // Default to dark so the server markup matches the no-flash script's
      // common path. suppressHydrationWarning: the script may flip this to the
      // stored "light" preference before React hydrates <html>.
      suppressHydrationWarning
      // globals.css sets `scroll-behavior: smooth` on html; Next 16 wants the
      // intent declared so router transitions can temporarily disable it
      // instead of warning (missing-data-scroll-behavior).
      data-scroll-behavior="smooth"
      className={`dark ${sans.variable} ${display.variable} ${hero.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {/* No-flash theme init — children form (matches the repo's inline
            <style>{`…`}</style> idiom) so no dangerouslySetInnerHTML. Both
            scripts are hash-allowlisted in the prod CSP (see
            lib/csp/inline-scripts.ts). */}
        <script suppressHydrationWarning>{THEME_INIT}</script>
        <script suppressHydrationWarning>{SW_SCRIPT}</script>
        <div className="page-enter flex flex-1 flex-col">{children}</div>
        <BottomTabBar />
        {HELP_ASSISTANT ? <AssistantWidgetMount /> : null}
      </body>
    </html>
  );
}
