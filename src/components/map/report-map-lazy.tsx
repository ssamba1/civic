"use client";

import dynamic from "next/dynamic";

export const ReportMapLazy = dynamic(
  () => import("@/components/map/report-map").then((m) => m.ReportMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[450px] w-full rounded-xl border border-white/[0.06] bg-[#0a0a0b] relative overflow-hidden lg:h-[550px]">
        <div className="absolute inset-0 flex items-center justify-center text-[13px] text-zinc-500">
          Loading map…
        </div>
      </div>
    ),
  },
);
