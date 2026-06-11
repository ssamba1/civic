"use client";

import { useEffect, useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";

interface EmergencyInterstitialProps {
  onOverride: () => void;
}

export default function EmergencyInterstitial({
  onOverride,
}: EmergencyInterstitialProps) {
  const call911Ref = useRef<HTMLAnchorElement>(null);
  const overrideRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Move focus to the primary action on mount so screen readers announce the
  // dialog immediately and keyboard/switch users can act without tabbing.
  useEffect(() => {
    call911Ref.current?.focus();
  }, []);

  // Safety-critical entrance: quick fade + slight zoom to direct attention to
  // the overlay without delaying the call-to-action, plus a slow attention ring
  // pulse around the warning icon. matchMedia gives reduced-motion users an
  // instant, motionless dialog.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-emergency-root]", {
          opacity: 0,
          scale: 0.95,
          duration: 0.2,
          ease: "power2.out",
        });
        gsap.fromTo(
          "[data-emergency-ring]",
          { opacity: 0.5, scale: 1 },
          {
            opacity: 0,
            scale: 1.35,
            duration: 1.6,
            ease: "power1.out",
            repeat: -1,
          },
        );
      });
    },
    { scope: rootRef },
  );

  // Trap Tab / Shift-Tab between the two interactive elements so focus cannot
  // escape to background content while the safety-critical overlay is visible.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    if (e.shiftKey) {
      if (document.activeElement === call911Ref.current) {
        e.preventDefault();
        overrideRef.current?.focus();
      }
    } else {
      if (document.activeElement === overrideRef.current) {
        e.preventDefault();
        call911Ref.current?.focus();
      }
    }
  };

  return (
    <div
      ref={rootRef}
      data-emergency-root
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="emergency-heading"
      onKeyDown={handleKeyDown}
      className="fixed inset-0 h-dvh z-50 flex flex-col bg-red-600 px-6 text-center overflow-y-auto"
    >
      {/* Scrollable inner — centers content but allows scroll on very small phones */}
      <div
        className="flex flex-col items-center justify-center min-h-full"
        style={{
          paddingTop: "max(2.5rem, calc(2.5rem + env(safe-area-inset-top, 0px)))",
          paddingBottom: "max(2.5rem, calc(2.5rem + env(safe-area-inset-bottom, 0px)))",
        }}
      >
        {/* Warning icon — aria-label so screen readers announce the icon's meaning
            before the heading text when the dialog gets focus. */}
        <div
          className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-white/20"
          aria-label="Warning"
          role="img"
        >
          {/* Attention ring — GSAP-driven expanding pulse (motion-safe only) */}
          <span
            data-emergency-ring
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/60 opacity-0"
          />
          <svg
            className="h-14 w-14 text-white"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>

        <h1 id="emergency-heading" className="text-2xl font-bold text-white mb-2">
          This appears to be an emergency
        </h1>
        <p className="text-white/80 text-base mb-10 max-w-xs">
          Our AI detected a potentially dangerous situation. If someone is in
          danger, please call 911 immediately.
        </p>

        {/* Call 911 button — min-h-[56px] for thumb target */}
        <a
          ref={call911Ref}
          href="tel:911"
          className="w-full max-w-xs rounded-full bg-white min-h-[56px] flex items-center justify-center text-center text-lg font-bold text-red-600 shadow-lg active:scale-95 transition-transform mb-4"
        >
          Call 911
        </a>

        {/* Override — min-h-[56px] for thumb target */}
        <button
          ref={overrideRef}
          type="button"
          onClick={onOverride}
          className="w-full max-w-xs rounded-full border-2 border-white/40 min-h-[56px] text-center text-sm font-semibold text-white active:bg-white/10 transition-colors"
        >
          This is not an emergency
        </button>
      </div>
    </div>
  );
}
