import { CountUp } from "@/components/landing/count-up";
import { Reveal } from "@/components/landing/reveal";

export function Stats() {
  return (
    <section className="px-8 sm:px-12 lg:px-20 py-24 sm:py-32 lg:py-40 border-b border-[var(--color-border)]">
      <div className="mx-auto max-w-7xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-primary)] mb-12">
          01 · The problem
        </p>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Card A — legacy burden */}
          <Reveal delay={0}>
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-10 lg:p-14 shadow-[0_20px_60px_-30px_rgba(10,132,255,0.15)] flex flex-col gap-6 h-full">
              <p
                className="font-hero leading-none tracking-tight text-[var(--color-foreground)]"
                style={{ fontSize: "clamp(96px,13vw,180px)" }}
              >
                <CountUp value="47" />
              </p>
              <div className="flex flex-col gap-3">
                <p className="text-[18px] sm:text-[20px] font-medium text-[var(--color-foreground)] leading-snug">
                  dropdowns in a legacy 311 form. Designed in 2003, still
                  shipping.
                </p>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  SeeClickFix · Tyler · Granicus
                </p>
              </div>
            </div>
          </Reveal>

          {/* Card B — the hero stat */}
          <Reveal delay={120}>
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-10 lg:p-14 shadow-[0_20px_60px_-30px_rgba(10,132,255,0.15)] flex flex-col gap-6 h-full relative overflow-hidden">
              {/* Radial blue glow */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-24 -left-24 w-[340px] h-[340px] rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, rgba(10,132,255,0.08) 0%, transparent 70%)",
                }}
              />

              <p
                className="font-hero leading-none tracking-tight text-[var(--color-primary)] relative z-10"
                style={{ fontSize: "clamp(96px,13vw,180px)" }}
              >
                <CountUp value="8s" />
              </p>

              <div className="flex flex-col gap-4 relative z-10">
                <p className="text-[18px] sm:text-[20px] font-medium text-[var(--color-foreground)] leading-snug">
                  median time for a Cumming resident to file a report. One
                  photo. Zero forms.
                </p>
                <span className="inline-flex self-start items-center rounded-full border border-[var(--color-primary)]/30 bg-[var(--color-primary-light)] px-3 py-1 font-mono text-[10.5px] tracking-[0.12em] text-[var(--color-primary)]">
                  AI-routed · 1.4s classification
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
