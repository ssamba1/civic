"use client";

/* ==================================================================
   Walk-up QR poster (NEXT_100 #16) — client component.

   Renders a printable poster: city name, "Report a problem here", and
   a QR code encoding the walk-up report URL for the given location.

   The SVG QR is generated server-side (src/lib/qr/walkup.ts is
   server-only) and passed in as a prop. This component only handles
   display + print layout. Print styles use Tailwind `print:` variants.
   ================================================================== */

interface WalkupPosterProps {
  /** City name to display on the poster. */
  cityName: string;
  /** Pre-rendered SVG string from renderWalkupQrSvg(). */
  qrSvg: string;
  /** Human-readable location label, e.g. "Bus Stop 42 — Main St". */
  locationLabel?: string;
  /** Full URL encoded in the QR, shown as small text for accessibility. */
  reportUrl: string;
}

export function WalkupPoster({
  cityName,
  qrSvg,
  locationLabel,
  reportUrl,
}: WalkupPosterProps) {
  return (
    <div
      className={[
        // Screen: centered card
        "mx-auto flex max-w-sm flex-col items-center gap-6 rounded-2xl border border-hairline bg-white p-8 shadow-lg",
        // Print: flush to page, no shadow, full width
        "print:mx-0 print:max-w-none print:rounded-none print:border-none print:shadow-none print:p-12",
      ].join(" ")}
      role="img"
      aria-label={`QR code to report a problem in ${cityName}`}
    >
      {/* Brand + city */}
      <div className="flex flex-col items-center gap-1 text-center print:gap-2">
        <span className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full bg-[var(--color-primary)] print:h-4 print:w-4"
            aria-hidden="true"
          />
          <span className="text-[15px] font-semibold tracking-tight text-gray-900 print:text-xl">
            Civic
          </span>
        </span>
        <p className="text-[12px] font-medium uppercase tracking-[0.1em] text-gray-500 print:text-base">
          {cityName}
        </p>
      </div>

      {/* Headline */}
      <p className="text-center text-[22px] font-bold leading-tight tracking-tight text-gray-900 print:text-[36px]">
        Report a problem here
      </p>

      {/* QR code */}
      <div
        className="flex h-48 w-48 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white p-2 print:h-72 print:w-72 print:rounded-2xl print:border-2"
        /* biome-ignore lint/security/noDangerouslySetInnerHtml: QR SVG generated server-side from qrcode lib; no user content */
        dangerouslySetInnerHTML={{ __html: qrSvg }}
        aria-hidden="true"
      />

      {/* Tagline */}
      <p className="text-center text-[13px] leading-relaxed text-gray-500 print:text-base">
        Scan with your phone camera. No app or account needed.
      </p>

      {/* Location label (optional) */}
      {locationLabel && (
        <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-center text-[12px] font-medium text-gray-700 print:rounded-xl print:px-4 print:py-2 print:text-sm">
          {locationLabel}
        </p>
      )}

      {/* Accessible URL for print (fallback for those who can't scan) */}
      <p className="break-all text-center text-[10px] text-gray-400 print:text-xs">
        {reportUrl}
      </p>
    </div>
  );
}
