"use client";

import dynamic from "next/dynamic";

// The hero map pulls in maplibre-gl (~1MB) + deck.gl (~500KB). Static-importing
// it forced that ~1.85MB into the landing route's first-load JS, which is the
// dominant cause of the slow/janky hero. It's a purely decorative, aria-hidden
// backdrop, so it's safe to code-split with ssr:false: the page paints with the
// gradient placeholder below (which matches the civic-light scrim, so there is
// no flash), then the real map streams in as a separate async chunk.
//
// On mobile the caller (ZampHero) does not mount this at all — the gradient is
// the final backdrop there — so phones never download the map deps.
const ZampMapBackdropLazy = dynamic(() => import("./ZampMapBackdrop"), {
  ssr: false,
  loading: () => <ZampMapFallback />,
});

// Static, dependency-free gradient that stands in for the live civic-light map
// (light Voyager streets + a soft Civic-blue radial + the bottom light fade
// that seats the wordmark). Reused as the standalone mobile backdrop.
export function ZampMapFallback() {
  return (
    <div
      aria-hidden="true"
      data-hero-bg="map-fallback"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      style={{
        background: [
          "radial-gradient(120% 95% at 50% 34%, rgba(10,132,255,0.16) 0%, transparent 58%)",
          "linear-gradient(to top, rgba(239,239,239,0.92) 0%, rgba(239,239,239,0.30) 32%, rgba(239,239,239,0) 52%)",
          "linear-gradient(160deg, #e9eef4 0%, #dde6f1 45%, #eef2f6 100%)",
        ].join(", "),
      }}
    />
  );
}

export default ZampMapBackdropLazy;
