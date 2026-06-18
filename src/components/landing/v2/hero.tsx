import Link from "next/link";
import type React from "react";
import { Reveal } from "@/components/landing/reveal";
import { ShaderHero } from "@/components/landing/shader-hero";
import { Button } from "@/components/ui/button";
import { Globe } from "@/components/ui/cobe-globe";

export function HeroGlobe({
  markers,
}: {
  markers: { id: string; location: [number, number]; label: string }[];
}) {
  return (
    <Globe
      markers={markers}
      markerColor={[0.04, 0.518, 1]}
      baseColor={[0.95, 0.96, 0.98]}
      glowColor={[1, 1, 1]}
      arcColor={[0.04, 0.518, 1]}
      dark={0}
      mapBrightness={5.5}
      diffuse={1.1}
      theta={0.28}
      speed={0.0028}
      markerSize={0.06}
      populate={90}
    />
  );
}

export function Hero({ globeSlot }: { globeSlot?: React.ReactNode }) {
  return (
    <section className="relative isolate flex min-h-[100dvh] flex-col items-center overflow-hidden bg-[var(--color-background)]">
      <div className="absolute inset-0 -z-10" style={{ opacity: 0.5 }}>
        <ShaderHero />
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-6 pt-28 text-center sm:px-10 sm:pt-32 lg:pt-36">
        <Reveal>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-background)]/70 px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-primary)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-md">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-primary)] opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />
            </span>
            Live in Cumming, GA
          </span>
        </Reveal>

        <Reveal delay={80}>
          <h1 className="font-hero mt-7 text-[56px] leading-[0.98] tracking-tight text-[var(--color-foreground)] sm:text-[76px] lg:text-[92px]">
            See it. Snap it.
            <br />
            <span className="italic text-[var(--color-primary)]">
              Your city fixes it.
            </span>
          </h1>
        </Reveal>

        <Reveal delay={160}>
          <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-[var(--color-muted)] sm:text-[19px]">
            One photo files the report. AI classifies, dedupes, and routes the
            work order before anyone picks up a phone.
          </p>
        </Reveal>

        <Reveal delay={240}>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              variant="primary"
              className="min-h-[44px] w-full sm:w-auto"
            >
              <Link href="/report">Report an issue</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="min-h-[44px] w-full sm:w-auto"
            >
              <Link href="/city/cumming">See the live dashboard</Link>
            </Button>
          </div>
        </Reveal>

        <Reveal
          delay={320}
          className="relative mt-12 w-full max-w-[min(80vw,420px)] lg:max-w-[760px]"
        >
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-[8%] -z-10 mx-auto aspect-square w-[88%] bg-[radial-gradient(circle_at_center,rgba(10,132,255,0.22),rgba(10,132,255,0.06)_45%,transparent_70%)] blur-2xl"
          />
          <div
            className="-mb-[32%] aspect-square w-full"
            style={{
              WebkitMaskImage:
                "linear-gradient(to bottom, black 0%, black 56%, transparent 78%)",
              maskImage:
                "linear-gradient(to bottom, black 0%, black 56%, transparent 78%)",
            }}
          >
            {globeSlot}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
