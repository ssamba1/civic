"use client";

import Link from "next/link";
import CtaPills from "./CtaPills";

// V2 final-CTA / footer monolith, ported VERBATIM from Riven Footer.jsx.
// Massive "Civic" wordmark spans full width; CTA pills overlay the top edge.
// Form replaced with the same pill CTA pair. Footer nav points at Civic routes.
const FOOTER_LINKS = [
  { label: "Dashboard", href: "/city/cumming" },
  { label: "Report", href: "/report" },
  { label: "For cities", href: "/onboard" },
  { label: "Requests", href: "/requests" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

export default function V2Footer() {
  return (
    <footer className="v2x-footer" id="join">
      <div className="v2x-footer__cta">
        <div className="v2x-footer__cta-inner">
          <p className="v2x-eyebrow v2x-eyebrow--centered">
            Your city, fixed faster
          </p>
          <h2 className="v2x-footer__cta-title">
            Snap the problem.{" "}
            <span className="v2x-italic">Civic routes the fix.</span>
          </h2>
          <div className="v2x-footer__form">
            <CtaPills />
          </div>
          <p className="v2x-footer__cta-sub">
            Free for residents. Open311 native for cities.
          </p>
        </div>
      </div>

      <div className="v2x-footer__mono" aria-hidden="true">
        <span className="v2x-footer__wordmark" role="img" aria-label="Civic">
          Civic
        </span>
      </div>

      <div className="v2x-footer__base">
        <nav className="v2x-footer__nav" aria-label="Footer">
          {FOOTER_LINKS.map((l) => (
            <Link key={l.label} href={l.href} className="v2x-footer__link">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="v2x-footer__credit">
          <span>&copy; 2026 Civic</span>
          <span className="v2x-footer__sep">&middot;</span>
          <span>AI-native 311 &middot; Open311 GeoReport v2 compatible</span>
        </div>
      </div>
    </footer>
  );
}
