/* Route-level skeleton for the fullscreen city map (/city/[slug]/map). Mirrors
   FullscreenMapOrchestrator's real chrome so the swap to live content has no
   geometry/color shift:
   - Root sizing matches the real component root (h-full w-full flex-1 min-h-0)
     so it fills the same <main> slot — not h-dvh, which drifts on desktop.
   - Map area: theme-following neutral canvas + faint tile grid (the basemap
     tracks the app theme, so this must NOT hardcode black — a black flash before
     a light basemap was the old bug).
   - Dispatch panel: the real panel is structurally forced-dark (bg-black scrim,
     white text) and pinned top-16 right-4 bottom-4 w-[280px]. The placeholder
     matches that position AND forces dark on itself (`.dark` wrapper) so the
     shared `.skeleton` shimmer + tokens resolve to their dark values — mirroring
     the real panel in both light and dark app themes. This route never passes
     lockedTeam/readOnly, so the real title is deterministically "Dispatch"
     (kept as real static text, not a shimmer bar) and the Team-view select IS
     rendered; the filter body mirrors Team/Category selects, the severity
     slider, the Status 2x2 grid, and the Color-by 1x3 grid. Filters are a FLAT
     section — the real code forbids a nested card here (double-card). The old
     skeleton pinned the panel LEFT and card-wrapped the filters; both are fixed.
   Shimmer + reduced-motion handling ride the shared `.skeleton` utility; the
   grid/ring pulses are compositor-only and motion-guarded below. */
export default function MapLoading() {
  return (
    <div
      className="relative flex h-full w-full flex-1 min-h-0 overflow-hidden bg-background"
      role="status"
      aria-busy="true"
      aria-label="Loading map"
    >
      {/* Map area — themed tile-grid placeholder (follows light/dark). */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(var(--hairline) 1px, transparent 1px), linear-gradient(90deg, var(--hairline) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          animation: "mapGridPulse 2.4s cubic-bezier(0.4,0,0.6,1) infinite",
        }}
      />

      {/* Center radiating pulse — suggests the map booting. Themed rings. */}
      <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
        <div className="relative h-24 w-24">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="absolute inset-0 rounded-full border border-hairline-strong"
              style={{
                animation:
                  "mapRingPulse 2.2s cubic-bezier(0.16,1,0.3,1) infinite",
                animationDelay: `${i * 400}ms`,
              }}
            />
          ))}
          <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/40" />
        </div>
      </div>

      {/* Desktop dispatch panel — forced-dark glass, pinned to match the real
          w-[280px] panel at top-16 right-4 bottom-4. `.dark` forces the always-
          dark panel look so shared tokens/.skeleton resolve their dark values. */}
      <div className="dark absolute bottom-4 right-4 top-16 z-10 hidden w-[280px] flex-col overflow-hidden rounded-[20px] border border-hairline bg-glass p-4 text-foreground shadow-[var(--shadow-pop)] backdrop-blur-xl lg:flex">
        {/* Header — real title is static "Dispatch"; only the count is data. */}
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <h2 className="text-[15px] font-semibold text-foreground">
            Dispatch
          </h2>
          <div className="skeleton h-3.5 w-16 rounded" />
        </div>

        {/* Scroll region — mirrors dispatchPanelContent's flat sections. */}
        <div className="flex flex-1 flex-col gap-3 overflow-hidden">
          {/* Divider above filters */}
          <div className="h-px w-full bg-hairline" />

          {/* Quick filters — FLAT section (no nested card: the panel IS the
              card). Team select · Category select · Severity slider · Status
              2x2 grid · Color-by 1x3 grid. */}
          <div className="flex flex-col gap-3 p-3">
            {/* Team view */}
            <div className="flex flex-col gap-1.5">
              <div className="skeleton h-3 w-20 rounded" />
              <div className="skeleton h-8 w-full rounded-md" />
              <div className="skeleton h-2.5 w-32 rounded" />
            </div>

            {/* Category */}
            <div className="flex flex-col gap-1.5 border-t border-hairline pt-3">
              <div className="skeleton h-3 w-16 rounded" />
              <div className="skeleton h-8 w-full rounded-md" />
            </div>

            {/* Severity */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div className="skeleton h-3 w-20 rounded" />
                <div className="skeleton h-3 w-6 rounded" />
              </div>
              <div className="skeleton h-1 w-full rounded-full" />
            </div>

            {/* Status — 2x2 grid */}
            <div className="flex flex-col gap-1.5 border-t border-hairline pt-3">
              <div className="skeleton h-3 w-14 rounded" />
              <div className="grid grid-cols-2 gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-7 rounded" />
                ))}
              </div>
            </div>

            {/* Color by — 1x3 grid */}
            <div className="flex flex-col gap-1.5 border-t border-hairline pt-3">
              <div className="skeleton h-3 w-16 rounded" />
              <div className="grid grid-cols-3 gap-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-7 rounded" />
                ))}
              </div>
            </div>
          </div>

          {/* Divider above the incident feed */}
          <div className="h-px w-full bg-hairline" />

          {/* Incident feed — status-tagged rows, fading down. */}
          <div className="flex flex-col gap-2 overflow-hidden">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex flex-col gap-1.5 rounded-lg p-3"
                style={{ opacity: 1 - i * 0.13 }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div
                    className="skeleton h-3.5 w-28 rounded"
                    style={{ animationDelay: `${i * 90}ms` }}
                  />
                  <div className="skeleton h-3 w-12 rounded" />
                </div>
                <div
                  className="skeleton h-3 w-3/4 rounded"
                  style={{ animationDelay: `${i * 90 + 40}ms` }}
                />
                <div className="skeleton h-4 w-16 rounded-full" />
                <div className="flex items-center justify-between">
                  <div className="skeleton h-3 w-14 rounded" />
                  <div className="skeleton h-3 w-10 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile: floating dispatch FAB placeholder (matches the real bottom-left
          FAB — solid dark button, appears instantly, so no shimmer). */}
      <div className="dark absolute bottom-[calc(env(safe-area-inset-bottom,0px)+3.5rem)] left-4 z-20 h-11 w-11 rounded-full border border-hairline bg-elevated shadow-lg lg:hidden" />

      <style>{`
        @keyframes mapGridPulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 1; }
        }
        @keyframes mapRingPulse {
          0% { transform: scale(0.35); opacity: 0; }
          35% { opacity: 0.4; }
          100% { transform: scale(1); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="mapGridPulse"], [style*="mapRingPulse"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
