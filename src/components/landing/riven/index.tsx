"use client";

import { useEffect, useState } from "react";
import { ScrollProgress } from "./anim";
import BentoHero from "./BentoHero";
import V2Footer from "./Footer";
import { MapPresetProvider, useMapPreset } from "./MapPresetContext";
import MapTweaksMenu from "./MapTweaksMenu";
import WaitlistNav from "./WaitlistNav";
import ZampHero from "./ZampHero";
import {
  ZampSection1,
  ZampSection2,
  ZampSection3,
  ZampSection4,
  ZampSection5,
} from "./ZampSections";
import "./riven-landing.css";
import "./zamp.css";
import "./bento-hero.css";

// Riven ZAMP variant — ported VERBATIM into Civic. The page now renders the
// zamp composition (Nav → colossal-wordmark hero → S1..S5 → footer monolith),
// which is what riven-research.vercel.app actually serves. Only two changes vs.
// the Riven source: green→blue accent (in zamp.css) and Riven→Civic copy.

// ---- root ----

export default function RivenLanding({
  fontClassName = "",
}: {
  fontClassName?: string;
}) {
  // Zamp composition — mirrors the live riven-research.vercel.app render:
  // Nav → colossal-wordmark hero → S1 → S2 → S3 (perks marquee lives inside
  // S3) → S4 → bottom-wash[S5 + footer monolith].
  return (
    <MapPresetProvider>
      <RivenLandingInner fontClassName={fontClassName} />
    </MapPresetProvider>
  );
}

function RivenLandingInner({ fontClassName }: { fontClassName: string }) {
  // ink flips the hero wordmark/nav light over dark basemaps (see zamp.css).
  const { ink, tweaksVisible } = useMapPreset();
  // ?hero=bento swaps in the clay bento hero (A/B against ZampHero). Read
  // after mount so server and first client render stay identical.
  const [bentoHero, setBentoHero] = useState(false);
  useEffect(() => {
    setBentoHero(
      new URLSearchParams(window.location.search).get("hero") === "bento",
    );
  }, []);
  return (
    <div
      className={`riven-root wl-design-zamp ${fontClassName}`}
      data-map-ink={ink}
    >
      <ScrollProgress />
      <WaitlistNav />
      <main className="v2-main">
        <section
          className={`v2-section v2-section--hero${bentoHero ? " v2-section--hero-bento" : ""}`}
          id="top"
        >
          {bentoHero ? <BentoHero /> : <ZampHero />}
        </section>
        <ZampSection1 />
        <ZampSection2 />
        <ZampSection3 />
        <ZampSection4 />
        <div className="wl-zamp-bottom-wash">
          <ZampSection5 />
          <V2Footer />
        </div>
      </main>
      {tweaksVisible && <MapTweaksMenu />}
    </div>
  );
}
