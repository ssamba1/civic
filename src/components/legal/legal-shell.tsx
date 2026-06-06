import { ArrowLeft, MapPin } from "lucide-react";
import Link from "next/link";

// ── Fill-ins ──────────────────────────────────────────────────────────────
// Replace these before launch. Shown verbatim on the live pages so they're
// impossible to miss. A lawyer should review the final Privacy Policy + Terms
// given Civic handles photos (that may contain people), precise location, and
// AI processing of images.
export const ORG = "[YOUR ORG / TEAM NAME]";
export const CONTACT = "[contact@your-domain.com]";
export const EFFECTIVE = "[EFFECTIVE DATE]";
export const GOVERNING_LAW =
  "[GOVERNING-LAW JURISDICTION, e.g. State of Georgia, USA]";

export function LegalShell({
  eyebrow,
  title,
  intro,
  children,
  otherDoc,
}: {
  eyebrow: string;
  title: string;
  intro: React.ReactNode;
  children: React.ReactNode;
  otherDoc: { href: string; label: string };
}) {
  return (
    <main className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--background)]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Link
            href="/"
            className="flex items-center gap-2 text-[15px] font-semibold tracking-tight"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-primary)] text-white">
              <MapPin className="h-4 w-4" />
            </span>
            Civic
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to app
          </Link>
        </div>
      </header>

      {/* pb-40 clears the globally-rendered BottomTabBar + home-indicator inset */}
      <article className="mx-auto max-w-3xl px-5 pb-40 pt-10 sm:pt-14">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-primary)]">
          {eyebrow}
        </p>
        <h1 className="font-hero mt-3 text-[40px] leading-[1.05] sm:text-[52px]">
          {title}
        </h1>
        <p className="mt-4 text-[13px] text-[var(--color-muted)]">
          Last updated {EFFECTIVE}
        </p>
        <div className="mt-7 text-[15px] leading-relaxed text-[var(--color-muted)]">
          {intro}
        </div>

        <div className="mt-10 space-y-9">{children}</div>

        <footer className="mt-16 border-t border-[var(--color-border)] pt-8">
          <p className="text-[14px] leading-relaxed text-[var(--color-muted)]">
            Questions about this document? Contact {ORG} at{" "}
            <a
              href={`mailto:${CONTACT}`}
              className="font-medium text-[var(--color-primary)] hover:underline"
            >
              {CONTACT}
            </a>
            .
          </p>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3">
            <Link
              href={otherDoc.href}
              className="text-[14px] font-medium text-[var(--color-primary)] hover:underline"
            >
              {otherDoc.label} →
            </Link>
            <Link
              href="/"
              className="text-[14px] font-medium text-[var(--foreground)] hover:underline"
            >
              Return to Civic
            </Link>
          </div>
        </footer>
      </article>
    </main>
  );
}

// ── Typographic primitives (shared by both legal pages) ────────────────────

export function Section({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n?: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="font-display text-[22px] font-semibold tracking-tight sm:text-[25px]">
        {n != null && (
          <span className="text-[var(--color-muted)] tabular-nums">{n}. </span>
        )}
        {title}
      </h2>
      <div className="mt-3.5 space-y-3.5">{children}</div>
    </section>
  );
}

export function Sub({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
      <div className="mt-2 space-y-3">{children}</div>
    </div>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[15px] leading-relaxed text-[var(--foreground)]">
      {children}
    </p>
  );
}

export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: static legal copy, never reordered
          key={i}
          className="flex gap-3 text-[15px] leading-relaxed text-[var(--foreground)]"
        >
          <span className="mt-[9px] h-1 w-1 flex-shrink-0 rounded-full bg-[var(--color-primary)]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "danger";
  title?: string;
  children: React.ReactNode;
}) {
  const skin = {
    info: "border-[var(--color-primary)]/30 bg-[var(--color-primary)]/8",
    warn: "border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10",
    danger: "border-[var(--color-danger)]/40 bg-[var(--color-danger)]/8",
  }[tone];
  const dot = {
    info: "text-[var(--color-primary)]",
    warn: "text-[var(--color-warning)]",
    danger: "text-[var(--color-danger)]",
  }[tone];
  return (
    <div className={`rounded-2xl border px-4 py-4 ${skin}`}>
      {title && (
        <p className={`text-[13.5px] font-semibold tracking-tight ${dot}`}>
          {title}
        </p>
      )}
      <div className="mt-1.5 space-y-2 text-[14px] leading-relaxed text-[var(--foreground)]">
        {children}
      </div>
    </div>
  );
}
