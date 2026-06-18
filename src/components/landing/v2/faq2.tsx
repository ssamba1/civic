import { Reveal } from "@/components/landing/reveal";

const FAQ_ITEMS = [
  {
    q: "How does the AI actually classify a photo?",
    a: "Gemini 2.5 Flash vision examines each upload and identifies the issue type, severity, and responsible department. It runs in roughly 1.4 seconds at ~$0.0001 per photo. A human reviewer in the city dashboard can override any classification, and overrides are logged to refine future runs.",
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
    a: "Faces, license plates, and door numbers are blurred before the photo leaves the device. We store the original tile only as long as the report is open and purge it after resolution. Precise GPS is used for routing, then rounded to the nearest 30m for the public dashboard.",
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
] as const;

export function Faq() {
  return (
    <section className="border-b border-[var(--color-border)] px-8 sm:px-12 lg:px-20 py-24 sm:py-32 lg:py-40">
      <div className="mx-auto max-w-7xl">
        <Reveal>
          <div className="text-center mb-16 sm:mb-20">
            <h2 className="font-display text-[36px] sm:text-[48px] leading-[1.1] tracking-tight text-[var(--color-foreground)]">
              Still skeptical? Good.
            </h2>
            <p className="mt-4 font-display italic text-[18px] text-[var(--color-primary)]">
              Every hard question deserves a straight answer.
            </p>
          </div>
        </Reveal>

        <div className="grid md:grid-cols-2 gap-x-12">
          {FAQ_ITEMS.map((item, i) => (
            <Reveal key={item.q} delay={Math.min(i, 5) * 60}>
              <details className="group border-b border-[var(--color-border)]">
                <summary className="[&::-webkit-details-marker]:hidden list-none cursor-pointer flex justify-between items-center py-5 text-[15px] font-medium text-[var(--color-foreground)] gap-4">
                  {item.q}
                  <span
                    aria-hidden="true"
                    className="flex-shrink-0 text-[var(--color-muted)] text-[20px] leading-none transition-transform duration-200 group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="py-4 text-[14.5px] leading-relaxed text-[var(--color-muted)] max-w-[55ch]">
                  {item.a}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
