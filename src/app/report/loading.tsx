// Route-level Suspense fallback. Mirrors CameraCapture's neutral first paint
// (full-screen black + centered spinner) so the shell shows instant feedback
// while anonymous sign-in / GPS acquisition / client JS boot. A faint shimmer
// bar hints that the viewfinder is loading rather than frozen.
export default function ReportLoading() {
  return (
    <div className="fixed inset-0 h-dvh flex flex-col items-center justify-center gap-5 bg-background">
      <div className="h-8 w-8 rounded-full border-2 border-hairline-strong border-t-white animate-spin" />
      <div className="report-loading-shimmer h-2 w-40 overflow-hidden rounded-full bg-overlay-strong" />
      <style>{`
        @keyframes report-loading-shimmer-kf {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .report-loading-shimmer { position: relative; }
        @media (prefers-reduced-motion: no-preference) {
          .report-loading-shimmer::after {
            content: "";
            position: absolute;
            inset: 0;
            background: linear-gradient(
              90deg,
              transparent,
              rgba(255, 255, 255, 0.35),
              transparent
            );
            animation: report-loading-shimmer-kf 1.3s ease-in-out infinite;
          }
        }
      `}</style>
    </div>
  );
}
