import Link from "next/link";
import { Reveal } from "@/components/landing/reveal";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { label: "Dashboard", href: "/city/cumming" },
  { label: "Report", href: "/report" },
  { label: "For cities", href: "/staff" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
] as const;

export function Footer() {
  return (
    <footer className="bg-white">
      {/* ── CTA block ──────────────────────────────────────────────── */}
      <div className="flex flex-col items-center py-28 text-center lg:py-36">
        <Reveal delay={0}>
          <p className="font-mono mb-5 text-[11px] uppercase tracking-[0.18em] text-[var(--color-primary)]">
            04 · Get started
          </p>
        </Reveal>

        <Reveal delay={80}>
          <h2 className="font-display mx-auto max-w-[14ch] text-[34px] leading-[1.1] tracking-[-0.02em] text-[var(--color-foreground)] sm:text-[46px] lg:text-[54px]">
            Your residents already have the camera.
          </h2>
        </Reveal>

        <Reveal delay={160}>
          <p className="mt-5 max-w-[38ch] text-[17px] leading-relaxed text-[var(--color-muted)]">
            One photo turns a pothole into a routed work order — no apps, no
            portals, no friction.
          </p>
        </Reveal>

        <Reveal delay={240}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" variant="primary">
              <Link href="/report">Report an issue</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/staff">Talk to a city team</Link>
            </Button>
          </div>
        </Reveal>
      </div>

      {/* ── Monolith wordmark ──────────────────────────────────────── */}
      <div className="overflow-hidden pb-0 -mt-6 lg:-mt-10" aria-hidden>
        <p
          className="font-hero select-none text-center leading-[0.78] tracking-[-0.04em] translate-y-[8%] bg-gradient-to-b from-[#0a84ff] to-[#bcdcff] bg-clip-text text-transparent"
          style={{ fontSize: "clamp(160px, 26vw, 440px)" }}
        >
          Civic
        </p>
      </div>

      {/* ── Base row ───────────────────────────────────────────────── */}
      <div className="border-t border-[var(--color-border)]">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-8 py-8 text-sm text-[var(--color-muted)] sm:flex-row sm:items-center sm:px-12 lg:px-20">
          <span>
            <span className="font-display font-medium text-[var(--color-foreground)]">
              Civic<span className="text-[var(--color-primary)]">.</span>
            </span>{" "}
            — The AI-native citizen infrastructure platform.
          </span>

          <nav
            aria-label="Footer navigation"
            className="flex flex-wrap items-center gap-x-5 gap-y-2"
          >
            {NAV_LINKS.map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                className="inline-flex min-h-[44px] items-center transition-colors hover:text-[var(--color-foreground)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] focus-visible:outline-offset-2 rounded-sm"
              >
                {label}
              </Link>
            ))}
            <span className="font-mono text-[var(--color-muted)]">
              &copy; {new Date().getFullYear()}
            </span>
          </nav>
        </div>
      </div>

      {/* ── Mobile BottomTabBar spacer ─────────────────────────────── */}
      <div
        className="md:hidden"
        style={{ height: "calc(4rem + env(safe-area-inset-bottom, 0px))" }}
        aria-hidden
      />
    </footer>
  );
}
