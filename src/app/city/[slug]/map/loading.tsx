export default function Loading() {
  return (
    <div className="h-dvh w-full relative overflow-hidden flex bg-black">
      {/* Map area — pulsing tile-grid placeholder */}
      <div
        className="absolute inset-0 z-0 bg-[#050505]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          animation: "mapGridPulse 2.4s cubic-bezier(0.4,0,0.6,1) infinite",
        }}
      />

      {/* Center radiating pulse — suggests the map booting */}
      <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
        <div className="relative h-24 w-24">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="absolute inset-0 rounded-full border border-white/[0.12]"
              style={{
                animation:
                  "mapRingPulse 2.2s cubic-bezier(0.16,1,0.3,1) infinite",
                animationDelay: `${i * 400}ms`,
              }}
            />
          ))}
          <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40" />
        </div>
      </div>

      {/* Desktop dispatch-panel shimmer — matches the w-[280px] side panel */}
      <div className="hidden lg:flex absolute top-16 left-4 bottom-4 w-[280px] z-10 flex-col gap-3 rounded-[20px] border border-white/[0.06] bg-black/20 p-4 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="h-4 w-20 rounded bg-white/[0.07] animate-pulse" />
          <div className="h-3 w-14 rounded bg-white/[0.05] animate-pulse" />
        </div>
        <div className="h-px w-full bg-white/[0.06]" />
        <div className="flex flex-col gap-3 rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="h-3 w-16 rounded bg-white/[0.06] animate-pulse" />
              <div
                className="h-8 w-full rounded-md bg-white/[0.04] animate-pulse"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            </div>
          ))}
        </div>
        <div className="h-px w-full bg-white/10" />
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-lg p-3"
              style={{ opacity: 1 - i * 0.14 }}
            >
              <div className="flex items-center justify-between gap-2">
                <div
                  className="h-3.5 w-28 rounded bg-white/[0.07] animate-pulse"
                  style={{ animationDelay: `${i * 90}ms` }}
                />
                <div className="h-3 w-12 rounded bg-white/[0.05] animate-pulse" />
              </div>
              <div
                className="h-3 w-3/4 rounded bg-white/[0.04] animate-pulse"
                style={{ animationDelay: `${i * 90 + 40}ms` }}
              />
              <div className="h-4 w-16 rounded-full bg-white/[0.05] animate-pulse" />
            </div>
          ))}
        </div>
      </div>

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
          .animate-pulse { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
