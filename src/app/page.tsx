import Link from "next/link";
import { Globe } from "@/components/ui/cobe-globe";
import { WaveHero } from "@/components/landing/wave-hero";
import { FAQ } from "@/components/landing/faq";
import { OrbitalSteps } from "@/components/landing/orbital-steps";
import { Reveal } from "@/components/landing/reveal";
import { Button } from "@/components/ui/button";
import { fetchReportMarkers } from "@/lib/dashboard-queries";

export default async function HomePage() {
  const reportMarkers = await fetchReportMarkers();
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--color-background)]">
      {/* nav */}
      <header className="absolute inset-x-0 top-0 z-50 pt-safe">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-8 sm:px-12 lg:px-20">
          <Link
            href="/"
            className="font-display inline-flex min-h-[44px] items-center text-[20px] font-medium tracking-[-0.01em] text-white"
          >
            Civic<span className="text-[var(--color-primary)]">.</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/city/cumming"
              className="hidden sm:inline-flex rounded-full px-3 py-1.5 text-sm font-medium text-white/70 transition-colors hover:text-white"
            >
              Dashboard
            </Link>
            <Link
              href="/staff"
              className="hidden sm:inline-flex rounded-full px-3 py-1.5 text-sm font-medium text-white/70 transition-colors hover:text-white"
            >
              For cities
            </Link>
            <Button asChild size="sm" variant="primary" className="ml-2 min-h-[44px] min-w-[44px]">
              <Link href="/report">Report</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* hero — asymmetric split */}
      <section
        className="relative isolate overflow-x-clip border-b border-[var(--color-border)] lg:min-h-[calc(100dvh-3.5rem)]"
        style={
          {
            backgroundColor: "#06080f",
            "--color-background": "#06080f",
            "--color-foreground": "#f5f5f7",
            "--color-muted": "#aeb4bf",
            "--color-border": "rgba(255,255,255,0.12)",
            "--color-surface": "rgba(255,255,255,0.06)",
          } as React.CSSProperties
        }
      >
        <WaveHero />
        <div className="mx-auto grid max-w-7xl gap-8 px-8 pb-10 pt-24 sm:px-12 lg:px-20 sm:pb-14 sm:pt-28 lg:grid-cols-[5fr_6fr] lg:min-h-[calc(100dvh-3.5rem)] lg:items-center">
          <div className="relative z-10 flex flex-col justify-center">
            <Reveal>
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--color-muted)]">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--color-primary)] opacity-40 blur-[1.5px]" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />
                </span>
                Live in Cumming, GA
              </span>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="font-display mt-7 text-[44px] font-normal leading-[1.06] text-[var(--color-foreground)] sm:text-[56px] lg:text-[66px]">
                See it. Snap it.
                <br />
                <span className="italic text-[var(--color-primary)]">Your city fixes it.</span>
              </h1>
            </Reveal>

            <Reveal delay={160}>
              <p className="mt-6 max-w-md text-[17px] leading-relaxed text-[var(--color-muted)]">
                Residents file infrastructure reports with a single photo. Our AI classifies the
                issue, dedupes duplicates, and routes a work order to the right crew before a human
                even reads it.
              </p>
            </Reveal>

            <Reveal delay={240}>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Button asChild size="lg" variant="accent" className="min-h-[44px] w-full sm:w-auto">
                  <Link href="/report">Report an issue</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="min-h-[44px] w-full sm:w-auto">
                  <Link href="/city/cumming">View Cumming dashboard</Link>
                </Button>
              </div>
            </Reveal>

            <Reveal delay={320}>
              <dl className="mt-12 flex flex-wrap items-baseline gap-x-8 gap-y-4 border-t border-[var(--color-border)] pt-7">
                <Stat value="1.4s" label="avg AI classification" />
                <Stat value="$0.0001" label="cost per photo" />
                <Stat value="42M" label="311 calls / yr, NYC" />
              </dl>
            </Reveal>
          </div>

          <div className="relative flex items-center justify-center">
            <Globe
              className="mx-auto w-full max-w-[min(68vw,360px)] sm:max-w-[400px] lg:max-w-none"
              markers={reportMarkers}
              markerColor={[0.04, 0.518, 1]}
              baseColor={[0.95, 0.96, 0.98]}
              glowColor={[0.92, 0.94, 0.98]}
              arcColor={[0.04, 0.518, 1]}
              dark={0}
              mapBrightness={5.5}
              diffuse={1.1}
              theta={0.28}
              speed={0.0028}
              markerSize={0.06}
              populate={90}
            />
          </div>
        </div>
      </section>

      {/* product explainer — asymmetric, numbered list (no card grid) */}
      <section className="border-b border-[var(--color-border)] bg-[var(--color-surface)]/40 px-8 py-14 sm:px-12 lg:px-20 sm:py-20 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-primary)]">
              The product
            </p>
            <h2 className="font-display mt-4 text-[30px] font-normal leading-[1.1] text-[var(--color-foreground)] sm:text-[40px] lg:text-[46px]">
              311 was designed in 2003. We rebuilt it for the camera in your pocket.
            </h2>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-[var(--color-muted)]">
              SeeClickFix and Tyler 311 still ask residents to choose between 47 dropdowns. Mark on
              Cumming&apos;s paving crew still gets work orders that read{" "}
              <em className="text-[var(--color-foreground)]">
                &ldquo;big hole on the road by the school&rdquo;
              </em>
              . We replace the human triage layer with vision models, so by the time a foreman
              opens the order, the photo, address, severity, and materials list are already
              attached.
            </p>
          </Reveal>

          <Reveal delay={120} className="lg:col-span-7">
            <ul className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
              <Feature
                index="01"
                title="One photo, no dropdowns"
                body="Residents open a PWA, take a photo, hit submit. Geolocation and timestamp attach automatically. The median report takes 8 seconds to file."
              />
              <Feature
                index="02"
                title="Open311 compliant from day one"
                body="Every report exports as Open311 GeoReport v2 JSON and XML. Cities running SeeClickFix, Tyler, or Granicus ingest us natively. No rip-and-replace."
              />
              <Feature
                index="03"
                title="Public accountability"
                body="Live dashboard of every report and its resolution time, by department. SLAs missed are at the top. Procurement decisions stop being a black box."
              />
            </ul>
          </Reveal>
        </div>
      </section>

      {/* orbital timeline — more air around the interactive canvas */}
      <section className="border-b border-[var(--color-border)] px-8 py-14 sm:px-12 lg:px-20 sm:py-24 lg:py-36">
        <div className="mx-auto max-w-7xl">
          <Reveal className="mb-14 flex flex-col items-start gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-primary)]">
                Workflow
              </p>
              <h2 className="font-display mt-4 text-[30px] font-normal leading-[1.1] text-[var(--color-foreground)] sm:text-[40px] lg:text-[46px]">
                From shutter click to repaired pothole, in six steps.
              </h2>
            </div>
            <p className="max-w-sm text-[15px] leading-relaxed text-[var(--color-muted)]">
              Click any node to expand it. Each step lists what runs, who owns it, and how
              confident the AI is in its decision.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <OrbitalSteps />
          </Reveal>
        </div>
      </section>

      <FAQ />

      {/* CTA strip */}
      <section className="border-b border-[var(--color-border)] bg-[var(--color-foreground)] px-8 py-14 sm:px-12 lg:px-20 sm:py-20 lg:py-24">
        <Reveal className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <h2 className="font-display text-[28px] font-normal leading-[1.1] text-[var(--color-background)] sm:text-[36px] lg:text-[40px]">
              Your city has a 311 system. Your residents have a camera.
            </h2>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-white/60">
              Cumming residents file in 8 seconds. Yours can too. The integration is Open311, the
              cost is per-report, and the dashboard is public from day one.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
            <Button asChild variant="accent" size="lg" className="min-h-[44px] w-full sm:w-auto">
              <Link href="/report">Try the resident PWA</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="min-h-[44px] w-full border-white/20 bg-transparent text-white hover:bg-white/10 sm:w-auto"
            >
              <Link href="/staff">Talk to a city team</Link>
            </Button>
          </div>
        </Reveal>
      </section>

      {/* footer */}
      <footer className="bg-[var(--color-background)]">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-8 py-10 text-sm text-[var(--color-muted)] sm:flex-row sm:items-center sm:px-12 lg:px-20">
          <div className="flex items-center gap-2">
            <span className="font-display text-[15px] font-medium text-[var(--color-foreground)]">
              Civic<span className="text-[var(--color-primary)]">.</span>
            </span>
            <span>The AI-native citizen infrastructure platform.</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/city/cumming" className="inline-flex min-h-[44px] items-center hover:text-[var(--color-foreground)]">
              Dashboard
            </Link>
            <Link href="/report" className="inline-flex min-h-[44px] items-center hover:text-[var(--color-foreground)]">
              Report
            </Link>
            <Link href="/staff" className="inline-flex min-h-[44px] items-center hover:text-[var(--color-foreground)]">
              For cities
            </Link>
            <span className="font-mono text-[var(--color-muted)]">
              &copy; {new Date().getFullYear()}
            </span>
          </div>
        </div>
        {/* Spacer: clears BottomTabBar (h-16 = 4rem) + safe-area on mobile; hidden md+ */}
        <div
          className="md:hidden"
          style={{ height: "calc(4rem + env(safe-area-inset-bottom, 0px))" }}
          aria-hidden
        />
      </footer>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="font-display text-[22px] font-medium tracking-tight text-[var(--color-foreground)] tabular-nums">
        {value}
      </dt>
      <dd className="text-[12.5px] leading-tight text-[var(--color-muted)]">{label}</dd>
    </div>
  );
}

function Feature({
  index,
  title,
  body,
}: {
  index: string;
  title: string;
  body: string;
}) {
  return (
    <li className="grid grid-cols-[auto_1fr] gap-x-6 py-7">
      <span className="pt-1 font-mono text-[12px] tabular-nums text-[var(--color-primary)]">
        {index}
      </span>
      <div>
        <h3 className="text-[15px] font-semibold tracking-tight text-[var(--color-foreground)]">
          {title}
        </h3>
        <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-[var(--color-muted)]">
          {body}
        </p>
      </div>
    </li>
  );
}
