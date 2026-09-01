import type { Metadata } from "next";

/* ==================================================================
   Privacy trust page (NEXT_100 #100).

   No US 311 competitor markets privacy as a pillar. This is the public promise:
   what we blur, what we never sell, how long we keep raw photos. Plain language,
   static. The technical backing is the mandatory client-side blur + the
   restricted photos-raw bucket (30-day TTL) documented in agents.md.
   ================================================================== */

export const metadata: Metadata = {
  title: "Civic | Our Privacy Promise",
  description:
    "How Civic protects residents: face and license-plate blur, no data sales, and short-lived raw photo storage.",
};

const PROMISES: { title: string; body: string }[] = [
  {
    title: "We never sell your data",
    body: "Your reports, photos, and contact details are never sold, rented, or shared for advertising. Ever.",
  },
  {
    title: "Faces and plates are blurred",
    body: "Every photo is blurred on your device, faces and license plates, before it ever leaves your phone. The blurred copy is the only one shown publicly.",
  },
  {
    title: "Original photos are short-lived and locked down",
    body: "The unblurred original is kept in a restricted store for a short window (about 30 days) for quality checks, then deleted. It is never public.",
  },
  {
    title: "No personal data in links",
    body: "Your status link uses an opaque token. No name, address, or account is exposed in the URL.",
  },
  {
    title: "You can report without an account",
    body: "File and track a report with no signup. Anonymous reporting is a first-class path, not an afterthought.",
  },
];

export default function PrivacyPromisePage() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
        <div className="mb-8 flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full bg-[var(--color-primary)]"
            aria-hidden="true"
          />
          <span className="text-[15px] font-semibold tracking-tight">
            Civic
          </span>
        </div>
        <h1 className="text-[32px] font-semibold tracking-tight leading-[1.1]">
          Our privacy promise
        </h1>
        <p className="mt-3 mb-8 text-sm text-subtle">
          Reporting a problem shouldn&apos;t cost you your privacy. Here&apos;s
          exactly what we do (and don&apos;t do) with what you share.
        </p>

        <ul className="flex flex-col gap-3">
          {PROMISES.map((p) => (
            <li
              key={p.title}
              className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-4"
            >
              <h2 className="text-[15px] font-semibold text-foreground">
                {p.title}
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-subtle">
                {p.body}
              </p>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-[12px] text-faint">
          Open311-compatible · privacy by default.
        </p>
      </div>
    </main>
  );
}
