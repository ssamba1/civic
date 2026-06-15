"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Ported from Riven WaitlistNav.jsx — same fixed bar, scroll-driven blur/mask,
// same grid layout. react-router smooth-scroll machinery dropped (Civic is a
// single landing route); anchors use plain hashes. Wordmark = plain "Civic".
function ArrowRightIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      aria-hidden="true"
      style={{ display: "inline-block" }}
    >
      <path
        d="M3 8h10m0 0l-4-4m4 4l-4 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function WaitlistNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={scrolled ? undefined : "wl-nav--top"}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        transition:
          "background 240ms cubic-bezier(.2,.8,.2,1), backdrop-filter 240ms cubic-bezier(.2,.8,.2,1)",
        background: "transparent",
        backdropFilter: scrolled ? "blur(14px) saturate(100%)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(14px) saturate(100%)" : "none",
        maskImage: scrolled
          ? "linear-gradient(to bottom, black 0%, black 62%, transparent 100%)"
          : "none",
        WebkitMaskImage: scrolled
          ? "linear-gradient(to bottom, black 0%, black 62%, transparent 100%)"
          : "none",
        paddingTop: 4,
        paddingBottom: 16,
        borderBottom: "none",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1560,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          padding: "10px clamp(1.65rem, 5.5vw, 6.6rem)",
          gap: 24,
          minHeight: 56,
        }}
      >
        <Link
          href="/"
          className="wl-display"
          style={{
            fontSize: 20,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            textDecoration: "none",
            lineHeight: 1,
            color: "rgb(var(--wl-ink-rgb))",
            justifySelf: "start",
          }}
          aria-label="Civic"
        >
          Civic
        </Link>

        <div style={{ justifySelf: "center" }} aria-hidden="true" />

        <Link
          href="/report"
          className="wl-pill-btn wl-nav-cta-mobile"
          style={{
            padding: "8px 18px",
            fontSize: 12.5,
            gap: 8,
            textDecoration: "none",
            justifySelf: "end",
          }}
        >
          Report an issue <ArrowRightIcon />
        </Link>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .wl-nav-cta-mobile {
            padding: 6px 12px !important;
            font-size: 11px !important;
            gap: 6px !important;
          }
          .wl-nav-cta-mobile svg { width: 11px !important; height: 11px !important; }
          .wl-nav--top .wl-nav-cta-mobile {
            opacity: 0.6;
          }
        }
      `}</style>
    </nav>
  );
}
