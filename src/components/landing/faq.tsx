"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Reveal } from "@/components/landing/reveal";

const FAQ_ITEMS = [
  {
    q: "How does the AI actually classify a photo?",
    a: "Gemini 2.5 Flash vision examines each upload and identifies the issue type, severity, and the responsible department. It runs in roughly 1.4 seconds at ~$0.0001 per photo. A human reviewer in the city dashboard can override any classification, and overrides are logged to refine future runs.",
  },
  {
    q: "Which cities can residents use Civic in right now?",
    a: "Cumming, Georgia is our resident-first launch city. Residents in any other city can still file reports, which we forward through the public Open311 endpoint for that jurisdiction when one exists. The public dashboard shows resolution times for ~30 US cities seeded from Open311 data.",
  },
  {
    q: "Does Civic replace the city's existing 311 system?",
    a: "No. Civic complements it. Every report we accept is exportable as Open311 GeoReport v2 JSON and XML, so the city's existing SeeClickFix, Tyler, Granicus, or in-house backend ingests it natively. When the city is ready, we offer two-way sync instead of a rip-and-replace.",
  },
  {
    q: "What happens to my photo and location data?",
    a: "Faces, license plates, and door numbers are blurred before the photo leaves the device. We store the original tile only as long as the report is open and purge it after resolution. Precise GPS is used for routing, then rounded to the nearest 30m for the public dashboard. Full policy in our privacy page.",
  },
  {
    q: "Is it free for residents?",
    a: "Yes. Always. The resident PWA, the public dashboard, and report tracking are free. Cities pay for the staff console, work order generation, and Open311 sync.",
  },
  {
    q: "Will I get an update when my report is fixed?",
    a: "Yes. You get a push notification when the work order is dispatched and a second one with the resolution photo when the crew marks it complete. Updates are also visible on the public dashboard without an account.",
  },
  {
    q: "What if my city's department gets the report and ignores it?",
    a: "Every report is public on the city dashboard with a timestamp and status. Cities that miss their stated SLA appear at the top of the accountability page. The dashboard exists exactly so 'lost' reports cannot stay lost.",
  },
];

export function FAQ() {
  return (
    <section className="border-t border-[var(--color-border)] bg-[var(--color-background)] px-4 py-16 sm:px-6 sm:py-24 lg:py-32">
      <div className="mx-auto grid max-w-6xl gap-10 sm:gap-16 lg:grid-cols-[1fr_2fr]">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-primary)]">
            FAQ
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--color-foreground)] sm:text-4xl">
            Answers, before
            <br /> you have to ask.
          </h2>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-[var(--color-muted)]">
            Civic is built so residents, city staff, and elected officials all see the same data. If
            something is still unclear after this, write to{" "}
            <a
              href="mailto:hello@civic.report"
              className="text-[var(--color-foreground)] underline underline-offset-4 hover:text-[var(--color-primary)]"
            >
              hello@civic.report
            </a>
            .
          </p>
        </div>

        <Accordion type="single" collapsible className="w-full">
          {FAQ_ITEMS.map((item, i) => (
            <Reveal key={item.q} delay={Math.min(i, 4) * 60}>
              <AccordionItem
                value={`item-${i}`}
                className={i === FAQ_ITEMS.length - 1 ? "border-b-0" : undefined}
              >
                <AccordionTrigger>{item.q}</AccordionTrigger>
                <AccordionContent>{item.a}</AccordionContent>
              </AccordionItem>
            </Reveal>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
