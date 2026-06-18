import { OrbitalSteps } from "@/components/landing/orbital-steps";
import { Reveal } from "@/components/landing/reveal";

const STEPS = [
  {
    num: "01",
    title: "Snap",
    body: "Open the PWA, take one photo. Location and timestamp attach themselves.",
  },
  {
    num: "02",
    title: "Route",
    body: "Vision AI classifies severity, dedupes neighbors, drafts the work order with materials list.",
  },
  {
    num: "03",
    title: "Fix",
    body: "The right crew gets it instantly. The public dashboard tracks resolution time.",
  },
] as const;

export function How() {
  return (
    <section className="px-8 sm:px-12 lg:px-20 py-24 sm:py-32 lg:py-40 border-b border-[var(--color-border)]">
      <div className="mx-auto max-w-7xl">
        {/* Eyebrow + headline — centered */}
        <div className="flex flex-col items-center text-center gap-5 mb-16 lg:mb-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-primary)]">
            02 · How it works
          </p>
          <h2 className="font-display text-[32px] sm:text-[42px] lg:text-[48px] leading-[1.1] tracking-tight text-[var(--color-foreground)]">
            From shutter click to work order.
          </h2>
        </div>

        {/* 3-col step strip */}
        <Reveal>
          <div className="grid md:grid-cols-3 md:divide-x divide-[var(--color-border)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
            {STEPS.map(({ num, title, body }) => (
              <div key={num} className="px-8 py-6 flex flex-col gap-3 bg-white">
                <p className="font-mono text-[13px] font-semibold text-[var(--color-primary)]">
                  {num}
                </p>
                <p className="font-semibold text-[17px] text-[var(--color-foreground)]">
                  {title}
                </p>
                <p className="text-[15px] text-[var(--color-muted)] leading-relaxed">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </Reveal>

        {/* OrbitalSteps — light-bg safe, renders directly */}
        <Reveal delay={80} className="mt-16 lg:mt-24">
          <OrbitalSteps />
        </Reveal>
      </div>
    </section>
  );
}
