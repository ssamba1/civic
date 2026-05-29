import { ArrowRight, Camera, ChevronRight, Eye, MapPin, Radio } from "lucide-react";
import Link from "next/link";
import { Globe } from "@/components/ui/cobe-globe";
import { FAQ } from "@/components/landing/faq";
import { OrbitalSteps } from "@/components/landing/orbital-steps";
import { Button } from "@/components/ui/button";
import { fetchReportMarkers } from "@/lib/dashboard-queries";

export default async function HomePage() {
  const reportMarkers = await fetchReportMarkers();
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--color-background)]">
      {/* nav */}
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)]/60 bg-[var(--color-background)]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-[var(--color-foreground)]"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-foreground)] text-[var(--color-background)]">
              <MapPin className="h-3.5 w-3.5" />
            </span>
            Civic
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/city/cumming"
              className="rounded-full px-3 py-1.5 text-sm font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--color-foreground)]"
            >
              Dashboard
            </Link>
            <Link
              href="/staff"
              className="rounded-full px-3 py-1.5 text-sm font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--color-foreground)]"
            >
              For cities
            </Link>
            <Button asChild size="sm" variant="primary" className="ml-2">
              <Link href="/report">
                Report
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* hero — asymmetric split */}
      <section className="relative overflow-x-clip border-b border-[var(--color-border)] min-h-[calc(100dvh-3.5rem)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(900px 600px at 80% 30%, rgba(10,132,255,0.06), transparent 60%)",
          }}
        />
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-16 lg:grid-cols-[5fr_6fr] lg:py-0 lg:min-h-[calc(100dvh-3.5rem)] lg:items-center">
          <div className="relative z-10 flex flex-col justify-center">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-muted)]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-primary)] opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />
              </span>
              Live in Cumming, GA
            </span>

            <h1 className="mt-6 text-5xl font-semibold leading-[1.04] tracking-[-0.03em] text-[var(--color-foreground)] sm:text-6xl lg:text-[68px]">
              See it.
              <br />
              Snap it.
              <br />
              <span className="text-[var(--color-primary)]">Your city fixes it.</span>
            </h1>

            <p className="mt-6 max-w-md text-[17px] leading-relaxed text-[var(--color-muted)]">
              Residents file infrastructure reports with a single photo. Our AI classifies the
              issue, dedupes duplicates, and routes a work order to the right crew before a human
              even reads it.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" variant="accent">
                <Link href="/report">
                  <Camera className="h-4 w-4" />
                  Report an issue
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/city/cumming">
                  View Cumming dashboard
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <dl className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-[var(--color-border)] pt-8">
              <Stat value="1.4s" label="Average AI classification" />
              <Stat value="$0.0001" label="Cost per photo" />
              <Stat value="42M" label="311 contacts annually, NYC" />
            </dl>
          </div>

          <div className="relative flex items-center justify-center">
            <div
              aria-hidden
              className="absolute inset-0 -z-10"
              style={{
                background:
                  "radial-gradient(closest-side, rgba(10,132,255,0.08), transparent 70%)",
              }}
            />
            <Globe
              className="w-full"
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
            />
          </div>
        </div>
      </section>

      {/* product explainer — asymmetric, no card grid */}
      <section className="border-b border-[var(--color-border)] bg-[var(--color-surface)]/40 px-6 py-24 sm:py-32">
        <div className="mx-auto grid max-w-7xl gap-16 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-primary)]">
              The product
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--color-foreground)] sm:text-4xl lg:text-[44px] lg:leading-[1.05]">
              311 was designed in 2003. We rebuilt it for the camera in your pocket.
            </h2>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-[var(--color-muted)]">
              SeeClickFix and Tyler 311 still ask residents to choose between 47 dropdowns. Mark on
              Cumming&apos;s paving crew still gets work orders that read{" "}
              <em className="not-italic text-[var(--color-foreground)]">
                &ldquo;big hole on the road by the school&rdquo;
              </em>
              . We replace the human triage layer with vision models, so by the time a foreman
              opens the order, the photo, address, severity, and materials list are already
              attached.
            </p>
          </div>

          <div className="lg:col-span-7">
            <ul className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
              <Feature
                icon={Eye}
                title="One photo, no dropdowns"
                body="Residents open a PWA, take a photo, hit submit. Geolocation and timestamp attach automatically. The median report takes 8 seconds to file."
              />
              <Feature
                icon={Radio}
                title="Open311 compliant from day one"
                body="Every report exports as Open311 GeoReport v2 JSON and XML. Cities running SeeClickFix, Tyler, or Granicus ingest us natively. No rip-and-replace."
              />
              <Feature
                icon={MapPin}
                title="Public accountability"
                body="Live dashboard of every report and its resolution time, by department. SLAs missed are at the top. Procurement decisions stop being a black box."
              />
            </ul>
          </div>
        </div>
      </section>

      {/* orbital timeline */}
      <section className="border-b border-[var(--color-border)] px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 flex flex-col items-start gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-primary)]">
                Workflow
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--color-foreground)] sm:text-4xl lg:text-[44px] lg:leading-[1.05]">
                From shutter click to repaired pothole, in six orbital steps.
              </h2>
            </div>
            <p className="max-w-sm text-[15px] leading-relaxed text-[var(--color-muted)]">
              Click any node to expand it. Each step lists what runs, who owns it, and how
              confident the AI is in its decision.
            </p>
          </div>

          <OrbitalSteps />
        </div>
      </section>

      <FAQ />

      {/* CTA strip */}
      <section className="border-b border-[var(--color-border)] bg-[var(--color-foreground)] px-6 py-20">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-[var(--color-background)] sm:text-4xl">
              Your city has a 311 system. Your residents need a camera.
            </h2>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-white/60">
              Cumming residents file in 8 seconds. Yours can too. The integration is Open311, the
              cost is per-report, and the dashboard is public from day one.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="accent" size="lg">
              <Link href="/report">
                Try the resident PWA
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/20 bg-transparent text-white hover:bg-white/10"
            >
              <Link href="/staff">Talk to a city team</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="bg-[var(--color-background)]">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-6 py-10 text-sm text-[var(--color-muted)] sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-[var(--color-foreground)] text-[10px] font-bold text-[var(--color-background)]">
              C
            </span>
            <span>Civic, the AI-native citizen infrastructure platform.</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/city/cumming" className="hover:text-[var(--color-foreground)]">
              Dashboard
            </Link>
            <Link href="/report" className="hover:text-[var(--color-foreground)]">
              Report
            </Link>
            <Link href="/staff" className="hover:text-[var(--color-foreground)]">
              For cities
            </Link>
            <span className="font-mono text-[var(--color-muted)]">
              &copy; {new Date().getFullYear()}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="font-mono text-2xl font-semibold tracking-tight text-[var(--color-foreground)]">
        {value}
      </dt>
      <dd className="mt-1 text-[12px] leading-tight text-[var(--color-muted)]">{label}</dd>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ElementType;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-6 py-7">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)]">
        <Icon className="h-4 w-4" />
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
