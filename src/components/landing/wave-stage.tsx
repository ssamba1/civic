"use client";

import { useState } from "react";
import { DEFAULT_WAVE, WaveHero, type WaveParams } from "./wave-hero";
import { WaveTweaks } from "./wave-tweaks";

/**
 * Client wrapper: owns the live wave params, renders the canvas + the
 * bottom-right tweak panel. Lets page.tsx stay a Server Component while the
 * interactive bits live in this leaf.
 */
export function WaveStage({ className = "" }: { className?: string }) {
  const [params, setParams] = useState<WaveParams>(DEFAULT_WAVE);

  return (
    <>
      <WaveHero {...params} className={className} />
      {/* Developer-only tweak panel — never ships in the production demo. */}
      {process.env.NODE_ENV !== "production" && (
        <WaveTweaks
          params={params}
          set={(patch) => setParams((p) => ({ ...p, ...patch }))}
          reset={() => setParams(DEFAULT_WAVE)}
        />
      )}
    </>
  );
}
