"use client";

import dynamic from "next/dynamic";

export const ReportMapLazy = dynamic(
  () => import("@/components/map/report-map").then((m) => m.ReportMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[400px] w-full animate-pulse rounded-xl border border-zinc-200 bg-zinc-50 lg:h-[500px]" />
    ),
  },
);
