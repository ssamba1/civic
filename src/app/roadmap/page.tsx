import type { Metadata } from "next";

/* ==================================================================
   Public roadmap (NEXT_100 #92).

   "What we're working on", public transparency that the city is actively
   improving service, not a black box. Curated content (edit the arrays below);
   deliberately not auto-generated so staff control the public message.
   ================================================================== */

export const metadata: Metadata = {
  title: "Civic | Public Roadmap",
  description:
    "What the city is working on now, next, and exploring to improve response to resident reports.",
};

interface Item {
  title: string;
  detail: string;
}

const NOW: Item[] = [
  {
    title: "Faster close-the-loop",
    detail:
      "Every resolved report now sends a photo + plain-language explanation by email and text.",
  },
  {
    title: "Reach every resident",
    detail:
      "Report by text message or a QR code on the street, no app or account needed.",
  },
  {
    title: "Storm readiness",
    detail:
      "Automatic reprioritization of the backlog when severe weather is forecast.",
  },
];

const NEXT: Item[] = [
  {
    title: "Neighborhood equity view",
    detail:
      "Response times broken down by area so no neighborhood is left behind.",
  },
  {
    title: "Field-crew mobile tools",
    detail:
      "An offline-ready work queue so crews keep moving in low-signal areas.",
  },
];

const EXPLORING: Item[] = [
  {
    title: "Predictive maintenance",
    detail: "Spotting the assets likely to fail next from report history.",
  },
  {
    title: "Sensor integration",
    detail: "Letting smart infrastructure file its own reports automatically.",
  },
];

function Section({ label, items }: { label: string; items: Item[] }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-[13px] font-medium uppercase tracking-[0.08em] text-faint">
        {label}
      </h2>
      <ul className="flex flex-col gap-3">
        {items.map((it) => (
          <li
            key={it.title}
            className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-4"
          >
            <h3 className="text-[15px] font-semibold text-foreground">
              {it.title}
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-subtle">
              {it.detail}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function RoadmapPage() {
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
          What we&apos;re working on
        </h1>
        <p className="mt-3 mb-8 text-sm text-subtle">
          How the city is improving the way resident reports get seen, routed,
          and fixed.
        </p>

        <Section label="Now" items={NOW} />
        <Section label="Next" items={NEXT} />
        <Section label="Exploring" items={EXPLORING} />

        <p className="mt-4 text-[12px] text-faint">
          This page reflects current priorities and will change as work ships.
        </p>
      </div>
    </main>
  );
}
