import { Reveal } from "@/components/landing/reveal";
import { AnimatedBar } from "@/components/landing/v2/anim";

const PERKS = [
  "Open311 native export",
  "No rip-and-replace",
  "Per-report pricing",
  "Public dashboard included",
  "Resident PWA, no app store",
  "AI triage in 1.4s",
  "Founding-city pricing locked",
  "Direct line to the builders",
] as const;

export function Cities() {
  return (
    <section className="border-b border-[var(--color-border)] px-8 sm:px-12 lg:px-20 py-24 sm:py-32 lg:py-40">
      <div className="mx-auto max-w-7xl lg:grid lg:grid-cols-[4fr_7fr] lg:gap-14">
        {/* LEFT — sticky rail */}
        <div className="mb-12 lg:mb-0 lg:sticky lg:top-28 lg:self-start">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-primary)]">
            03 · Founding cities
          </p>
          <p className="mt-3 font-mono text-[11px] text-[var(--color-muted)]">
            Pilot program · 2026
          </p>
        </div>

        {/* RIGHT — content */}
        <div>
          <Reveal>
            <h2 className="font-display text-[32px] sm:text-[42px] leading-[1.12] tracking-tight text-[var(--color-foreground)]">
              Cumming is first.
              <br />
              Your city is next.
            </h2>
          </Reveal>

          <Reveal delay={80}>
            <p className="mt-6 text-[15px] leading-relaxed text-[var(--color-muted)] max-w-[52ch]">
              Founding cities get Open311-native export from day one, per-report
              pricing that scales with usage, and a public accountability
              dashboard — no rip-and-replace required.
            </p>
          </Reveal>

          <Reveal delay={140}>
            <div className="mt-10">
              <AnimatedBar pct={20} />
              <p className="mt-3 font-mono text-[11px] text-[var(--color-muted)]">
                1 of 5 pilot slots filled
              </p>
            </div>
          </Reveal>

          <Reveal delay={180}>
            <ul
              aria-label="Founding-city perks"
              className="mt-10 flex flex-wrap gap-2.5"
            >
              {PERKS.map((perk, i) => (
                <Reveal key={perk} delay={200 + i * 40}>
                  <li className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-[13.5px] text-[var(--color-foreground)]">
                    {perk}
                  </li>
                </Reveal>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={560}>
            <a
              href="/teams"
              className="mt-10 inline-block text-[var(--color-primary)] font-medium text-[15px] hover:underline underline-offset-4"
            >
              Talk to a city team →
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
