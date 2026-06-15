import { Geist, Manrope } from "next/font/google";
import RivenLanding from "@/components/landing/riven";

// Zamp variant fonts (verified against the live Riven zamp render):
//   display = Geist  →  bound to --wl-font-display (colossal wordmark + numerals)
//   body    = Manrope →  bound to --wl-font-body
// Mono stays JetBrains Mono (loaded by the root layout as --font-mono);
// the zamp CSS scope aliases --wl-font-mono onto that stack. We do NOT touch
// src/app/layout.tsx.
const geist = Geist({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-geist",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-manrope",
  display: "swap",
});

const fontClassName = `${geist.variable} ${manrope.variable}`;

export default function HomePage() {
  return <RivenLanding fontClassName={fontClassName} />;
}
