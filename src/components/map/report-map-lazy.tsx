"use client";

import dynamic from "next/dynamic";

export const ReportMapLazy = dynamic(
  () => import("@/components/map/report-map").then((m) => m.ReportMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[300px] w-full rounded-xl border border-white/[0.06] bg-[#0a0a0b] relative overflow-hidden sm:h-[450px] lg:h-[550px]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative h-20 w-20">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="absolute inset-0 rounded-full border border-white/[0.15]"
                style={{
                  animation:
                    "mapLazyRing 2.1s cubic-bezier(0.16,1,0.3,1) infinite",
                  animationDelay: `${i * 400}ms`,
                }}
              />
            ))}
            <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/35" />
          </div>
        </div>
        <style>{`
          @keyframes mapLazyRing {
            0% { transform: scale(0.3); opacity: 0; }
            35% { opacity: 0.45; }
            100% { transform: scale(1); opacity: 0; }
          }
          @media (prefers-reduced-motion: reduce) {
            [style*="mapLazyRing"] { animation: none !important; }
          }
        `}</style>
      </div>
    ),
  },
);
