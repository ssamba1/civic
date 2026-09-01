import type { CSSProperties } from "react";

/** Route-level skeleton: holds the zamp landing's nav + colossal-wordmark hero
 *  shape while the home RSC + client bundle resolve, so the swap to live content
 *  has no geometry or color shift.
 *
 *  The landing (`.riven-root.wl-design-zamp`) is a structurally forced-LIGHT
 *  marketing island: it hardcodes an #efefef canvas + black ink regardless of
 *  the app theme, and the default `civic-light` map preset renders a BLACK
 *  colossal wordmark over a light plate. The app's own default theme is DARK
 *  (`<html class="dark">`), so a token-following loader would flash a dark
 *  canvas before hydrating to the light landing. There is no `.light` class
 *  (globals ships `:root` light + a `.dark` override only), so we pin the LIGHT
 *  token values inline on the root, the symmetric analog of the forced-dark
 *  loaders' `className="dark"`, making the shared `.skeleton` + semantic
 *  utilities resolve their light values here.
 *
 *  The right-hand sign-up card is itself structurally forced-DARK (black glass +
 *  white copy, always), so that subtree gets `className="dark"` to mirror it.
 *  The same pattern as the map dispatch panel. The small nav "Civic" wordmark
 *  needs no data, so it stays real static text at the real weight. */
const LIGHT_TOKENS = {
  colorScheme: "light",
  "--background": "#f7f7f8",
  "--elevated": "#ededf0",
  "--overlay-strong": "rgba(0, 0, 0, 0.07)",
  "--hairline": "rgba(0, 0, 0, 0.08)",
  "--foreground": "#141415",
} as CSSProperties;

export default function Loading() {
  return (
    <div
      className="relative flex min-h-[100dvh] flex-col bg-background"
      style={LIGHT_TOKENS}
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      {/* Nav silhouette, fixed 3-col grid (wordmark · empty · CTA), mirroring
          WaitlistNav: max-w 1560, min-h 56, the same clamp inline padding. */}
      <header className="absolute inset-x-0 top-0 z-50">
        <div
          className="mx-auto grid items-center gap-6"
          style={{
            maxWidth: 1560,
            gridTemplateColumns: "1fr auto 1fr",
            minHeight: 56,
            padding: "10px clamp(1.65rem,5.5vw,6.6rem)",
          }}
        >
          {/* Real static wordmark. Instant, needs no data. */}
          <span className="justify-self-start text-[20px] font-medium leading-none tracking-[-0.02em] text-foreground">
            Civic
          </span>
          <div aria-hidden="true" />
          {/* "Report an issue" pill CTA placeholder. */}
          <div className="skeleton h-8 w-36 justify-self-end rounded-full" />
        </div>
      </header>

      {/* Hero, colossal wordmark bottom-left, sign-up card bottom-right. Row on
          desktop (space-between / items-end), stacked + centered under 900px,
          mirroring `.wl-lp-narrow`. */}
      <section className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center gap-8 overflow-hidden px-6 pb-16 pt-[clamp(96px,14vh,132px)] min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between min-[900px]:gap-[clamp(24px,4vw,72px)] min-[900px]:px-[clamp(40px,6vw,96px)] min-[900px]:pb-[clamp(48px,8vh,96px)] min-[900px]:pt-[clamp(120px,12vw,180px)]">
        {/* Colossal "Civic" wordmark placeholder, mirrors the bottom-anchored
            hero wordmark (font clamp(120px,18vw,320px), width clamp(640,72vw,1280)).
            A shimmer slab reserves its mass; kept as a block (not live text) so the
            per-letter entrance animation doesn't double-render on hydrate. */}
        <div className="flex w-full justify-center min-[900px]:flex-1 min-[900px]:justify-start">
          <div className="skeleton h-[clamp(84px,13vw,220px)] w-[clamp(320px,50vw,860px)] max-w-full rounded-lg" />
        </div>

        {/* Sign-up card. Structurally forced-DARK black glass; `.dark` makes its
            skeleton blocks + hairlines resolve dark, mirroring the real card. */}
        <aside className="w-full max-w-[460px] min-[900px]:w-[clamp(340px,32vw,460px)] min-[900px]:max-w-none min-[900px]:flex-none min-[900px]:self-end">
          <div className="dark flex flex-col gap-[clamp(16px,1.6vw,22px)] rounded-[22px] border border-hairline bg-glass p-[clamp(22px,2.2vw,36px)] shadow-[var(--shadow-pop)] backdrop-blur-xl">
            {/* Tagline, ~2 mono lines. */}
            <div className="space-y-2">
              <div className="skeleton h-4 w-full rounded" />
              <div className="skeleton h-4 w-4/5 rounded" />
            </div>

            {/* Feature list, 3 bullets (dot + text). Hidden under 640px, as the
                real card drops the list on phones. */}
            <div className="hidden flex-col gap-2.5 sm:flex">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="skeleton mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="skeleton h-3 w-full rounded" />
                    <div className="skeleton h-3 w-2/3 rounded" />
                  </div>
                </div>
              ))}
            </div>

            {/* Hero form, two stacked CTA pills + a microcopy line. */}
            <div className="flex flex-col gap-2.5">
              <div className="skeleton h-11 w-full rounded-full" />
              <div className="skeleton h-11 w-full rounded-full" />
              <div className="skeleton mt-0.5 h-2.5 w-40 rounded" />
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
