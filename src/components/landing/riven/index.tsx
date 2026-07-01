"use client";

import type { ReactNode } from "react";
import {
  AnimatedBar,
  CountUp,
  Reveal,
  ScrollProgress,
  StaggerGroup,
  StaggerItem,
} from "./anim";
import V2Footer from "./Footer";
import { MapPresetProvider, useMapPreset } from "./MapPresetContext";
import MapTweaksMenu from "./MapTweaksMenu";
import WaitlistHero from "./WaitlistHero";
import WaitlistNav from "./WaitlistNav";
import ZampHero from "./ZampHero";
import {
  ZampSection1,
  ZampSection2,
  ZampSection3,
  ZampSection4,
  ZampSection5,
} from "./ZampSections";
import "./riven-landing.css";
import "./zamp.css";

// Riven ZAMP variant — ported VERBATIM into Civic. The page now renders the
// zamp composition (Nav → colossal-wordmark hero → S1..S5 → footer monolith),
// which is what riven-research.vercel.app actually serves. Only two changes vs.
// the Riven source: green→blue accent (in zamp.css) and Riven→Civic copy.
//
// The V2 layout (Stats/How/Cohort/Faq + WaitlistHero/ResearchWorkspace/
// WaitlistContainerScroll) is kept in this repo but NO LONGER RENDERED — the
// V2 section functions below are retained for reference, not mounted.

// ---- data ----

const COHORT_CAP = 5;
const COHORT_FILLED = 1;

const PERKS = [
  "Open311 native export",
  "No rip-and-replace",
  "Per-report pricing",
  "Public dashboard included",
  "Resident PWA, no app store",
  "AI triage in 1.4s",
  "Founding-city pricing locked",
  "Direct line to the builders",
];

const STEPS: { n: string; label: string; body: ReactNode }[] = [
  {
    n: "01",
    label: "Snap",
    body: (
      <>
        A resident photographs broken infrastructure in the PWA. Location, time,
        and metadata attach automatically &mdash; no dropdowns.
      </>
    ),
  },
  {
    n: "02",
    label: "Route",
    body: (
      <>
        AI classifies the issue in 1.4s, dedupes it against existing reports,
        and generates an Open311 work order for the right crew.
      </>
    ),
  },
  {
    n: "03",
    label: "Fix",
    body: (
      <>
        The crew gets a photo and exact location, loads the right materials, and
        closes it out. The resident gets a before/after notification.
      </>
    ),
  },
];

const FAQS = [
  {
    q: "How does the AI actually classify a photo?",
    a: "Gemini 2.5 Flash vision identifies the issue type, severity, and responsible department in ~1.4 seconds at roughly $0.0001 per photo. A human reviewer in the city dashboard can override any classification, and overrides refine future runs.",
  },
  {
    q: "Which cities can residents use Civic in right now?",
    a: "Cumming, Georgia is our resident-first launch city. Residents elsewhere can still file reports, which we forward through the public Open311 endpoint for that jurisdiction when one exists.",
  },
  {
    q: "Does Civic replace the city's existing 311 system?",
    a: "No. Every report is exportable as Open311 GeoReport v2 JSON and XML, so an existing SeeClickFix, Tyler, or in-house backend ingests it natively. When the city is ready, we offer two-way sync instead of a rip-and-replace.",
  },
  {
    q: "What happens to my photo and location data?",
    a: "Faces, plates, and door numbers are blurred before the photo leaves the device. We keep the original only while the report is open, then purge it. Precise GPS routes the work order, then rounds to 30m for the public dashboard.",
  },
  {
    q: "Is it free for residents?",
    a: "Yes, always. The resident PWA, public dashboard, and report tracking are free. Cities pay for the staff console, work order generation, and Open311 sync.",
  },
  {
    q: "Will I get an update when my report is fixed?",
    a: "Yes. You get a push when the work order is dispatched and another with the resolution photo when the crew marks it complete. Updates are also public on the dashboard without an account.",
  },
  {
    q: "What if the department gets the report and ignores it?",
    a: "Every report is public on the city dashboard with a timestamp and status. Cities that miss their stated SLA appear at the top of the accountability page. The dashboard exists exactly so 'lost' reports cannot stay lost.",
  },
];

// ---- atoms ----

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 8h10m0 0l-4-4m4 4l-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---- Section A: stats ----

function StatsSection() {
  return (
    <section className="v2x v2x--stats" id="why">
      <Reveal as="div" y={20} duration={0.7} className="v2x-stats__head">
        <p className="v2x-eyebrow">01 &middot; The problem with legacy 311</p>
        <h2 className="v2x-problem">
          Reporting a pothole means guessing a category in a form designed in
          2003.{" "}
          <span className="v2x-problem__lead">Civic just needs the photo.</span>
        </h2>
      </Reveal>

      <StaggerGroup
        className="v2x-stats__grid"
        delayChildren={0.05}
        stagger={0.12}
      >
        <StaggerItem className="v2x-stat-card">
          <div className="v2x-stat-num">
            <CountUp to={47} duration={1.6} />
          </div>
          <p className="v2x-stat-body">
            dropdown taps a resident makes in a legacy 311 form before a report
            is even submitted.
          </p>
          <p className="v2x-stat-source">
            Source: Civic field audit of public 311 web forms across 12 US
            cities, 2025
          </p>
        </StaggerItem>

        <StaggerItem className="v2x-stat-card v2x-stat-card--inverse">
          <div className="v2x-stat-num">
            <CountUp to={8} duration={1.2} />
            <span className="v2x-stat-num__unit">s</span>
          </div>
          <p className="v2x-stat-body">
            median time from photo to routed work order in Cumming. One tap, no
            category, no phone call.
          </p>
          <p className="v2x-stat-source">
            Source: Civic Cumming, GA pilot &mdash; median across live resident
            reports
          </p>
          <div className="v2x-stat-chip" aria-hidden="true">
            <span className="v2x-stat-chip__dot" /> AI-routed &middot; 1.4s
            classification
          </div>
        </StaggerItem>
      </StaggerGroup>
    </section>
  );
}

// ---- Section B: how it works ----

function HowSection() {
  return (
    <section className="v2x v2x--how" id="how">
      <Reveal as="div" y={18} className="v2x-how__head">
        <p className="v2x-eyebrow">02 &middot; How it works</p>
        <h2 className="v2x-how__title">
          Three steps. <span className="v2x-italic">No phone call, ever.</span>
        </h2>
      </Reveal>

      <StaggerGroup
        className="v2x-how__strip"
        delayChildren={0.08}
        stagger={0.12}
      >
        {STEPS.map((step, i) => (
          <StaggerItem key={step.n} className="v2x-how__step">
            <div className="v2x-how__num">{step.n}</div>
            <div className="v2x-how__label">{step.label}</div>
            <p className="v2x-how__body">{step.body}</p>
            {i < STEPS.length - 1 && (
              <div className="v2x-how__connector" aria-hidden="true" />
            )}
          </StaggerItem>
        ))}
      </StaggerGroup>

      <Reveal
        as="figure"
        y={36}
        delay={0.15}
        duration={0.95}
        className="v2x-how__shot"
      >
        {/* biome-ignore lint/performance/noImgElement: flattened screenshot ported verbatim from Riven v2/index.jsx */}
        <img
          src="/landing-shots/editor-overview.webp"
          alt="Civic console — left sidebar with report queue, center work order for a Cumming pothole, right AI routing panel with Open311 dispatch"
          loading="lazy"
          width={1600}
          height={1000}
        />
      </Reveal>
    </section>
  );
}

// ---- Section C: founding cohort ----

function CohortSection() {
  const pct = Math.min(100, Math.round((COHORT_FILLED / COHORT_CAP) * 100));
  return (
    <section className="v2x v2x--cohort" id="why-join">
      <div className="v2x-cohort__rail">
        <p className="v2x-eyebrow v2x-eyebrow--rail">
          Founding cities &middot; 5 pilot slots &middot; {COHORT_FILLED} taken
        </p>
      </div>

      <div className="v2x-cohort__body">
        <Reveal as="h2" y={22} className="v2x-cohort__title">
          The first five cities running Civic{" "}
          <span className="v2x-italic">shape what this becomes.</span>
        </Reveal>
        <Reveal as="p" y={20} delay={0.05} className="v2x-cohort__sub">
          Pilot cities lock founding pricing forever, get a direct line to the
          builders, and ship Open311-native resident reporting without ripping
          out the system they already run.
        </Reveal>

        <Reveal y={18} delay={0.08} className="v2x-cohort__progress">
          <div className="v2x-cohort__bar" aria-hidden="true">
            <AnimatedBar pct={pct} className="v2x-cohort__bar-fill" />
          </div>
          <div className="v2x-cohort__progress-meta">
            <span className="v2x-cohort__progress-num">
              <CountUp to={COHORT_FILLED} duration={1.2} /> / {COHORT_CAP}
            </span>
            <span className="v2x-cohort__progress-label">slots claimed</span>
          </div>
        </Reveal>

        <StaggerGroup
          as="ul"
          className="v2x-cohort__pills"
          delayChildren={0.08}
          stagger={0.045}
        >
          {PERKS.map((perk) => (
            <StaggerItem as="li" key={perk} className="v2x-cohort__pill">
              {perk}
            </StaggerItem>
          ))}
        </StaggerGroup>

        <Reveal y={14} delay={0.2} className="v2x-cohort__foot">
          <a href="/teams" className="v2x-link">
            Become a founding city <ArrowIcon />
          </a>
        </Reveal>
      </div>
    </section>
  );
}

// ---- Section D: FAQ ----

function FaqSection() {
  return (
    <section className="v2x v2x--faq" id="faq">
      <Reveal y={28} duration={0.85} className="v2x-faq__manifesto">
        <p className="v2x-eyebrow v2x-eyebrow--centered">
          04 &middot; Questions
        </p>
        <h2 className="v2x-faq__q">
          What do residents <span className="v2x-italic">actually</span> get
          from Civic?
        </h2>
        <p className="v2x-faq__a-lead">
          A report that routes itself &mdash; and proof it got fixed.
        </p>
      </Reveal>

      <div className="v2x-faq__list">
        {FAQS.map((item) => (
          <details key={item.q} className="v2x-faq__row" name="civic-faq">
            <summary className="v2x-faq__row-q">
              <span>{item.q}</span>
              <span className="v2x-faq__row-icon" aria-hidden="true">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 20 20"
                  fill="none"
                  role="img"
                >
                  <title>Toggle answer</title>
                  <path
                    d="M10 4v12M4 10h12"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </summary>
            <p className="v2x-faq__row-a">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

// ---- root ----

export default function RivenLanding({
  fontClassName = "",
}: {
  fontClassName?: string;
}) {
  // Zamp composition — mirrors the live riven-research.vercel.app render:
  // Nav → colossal-wordmark hero → S1 → S2 → S3 (perks marquee lives inside
  // S3) → S4 → bottom-wash[S5 + footer monolith]. The V2 sections above are
  // retained in this file but not mounted.
  return (
    <MapPresetProvider>
      <RivenLandingInner fontClassName={fontClassName} />
    </MapPresetProvider>
  );
}

function RivenLandingInner({ fontClassName }: { fontClassName: string }) {
  // ink flips the hero wordmark/nav light over dark basemaps (see zamp.css).
  const { ink, tweaksVisible } = useMapPreset();
  return (
    <div
      className={`riven-root wl-design-zamp ${fontClassName}`}
      data-map-ink={ink}
    >
      <ScrollProgress />
      <WaitlistNav />
      <main className="v2-main">
        <section className="v2-section v2-section--hero" id="top">
          <ZampHero />
        </section>
        <ZampSection1 />
        <ZampSection2 />
        <ZampSection3 />
        <ZampSection4 />
        <div className="wl-zamp-bottom-wash">
          <ZampSection5 />
          <V2Footer />
        </div>
      </main>
      {tweaksVisible && <MapTweaksMenu />}
    </div>
  );
}

// Keep the V2 hero + sections defined (not deleted) so the V2 layout stays
// available for future re-enable. They're no-op referenced here to avoid
// unused-symbol errors now that the zamp composition is what renders.
void WaitlistHero;
void StatsSection;
void HowSection;
void CohortSection;
void FaqSection;
