"use client";

import Link from "next/link";

// Civic has no waitlist. Replace Riven's email form with two pill CTAs styled
// EXACTLY like Riven's .wl-pill-btn (3D extruded chip). Primary → /report,
// ghost → /city/cumming.
function ArrowRightIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      aria-hidden="true"
      style={{ display: "inline-block" }}
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

export default function CtaPills() {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 14,
        justifyContent: "center",
        alignItems: "center",
        width: "100%",
      }}
    >
      <Link href="/report" className="wl-pill-btn">
        Report an issue <ArrowRightIcon />
      </Link>
      <Link href="/city/cumming" className="wl-pill-btn wl-pill-btn--ghost">
        See the live dashboard
      </Link>
    </div>
  );
}
