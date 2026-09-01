// Route-level Suspense fallback. Mirrors CameraCapture's neutral first paint
// (full-screen viewfinder shell + centered spinner) so the shell shows instant
// feedback while anonymous sign-in / GPS acquisition / client JS boot. The
// viewfinder is structurally black-first, so this shell forces `.dark`, the
// shared `.skeleton` + `foreground` tokens then resolve to their dark values
// (mirroring the real panel in both light and dark app themes) instead of being
// hand-hardcoded. A faint shimmer bar hints the viewfinder is loading, not
// frozen; its shimmer + reduced-motion handling ride the shared `.skeleton`.
export default function ReportLoading() {
  return (
    <div
      className="dark fixed inset-0 h-dvh flex flex-col items-center justify-center gap-5 bg-background"
      role="status"
      aria-busy="true"
      aria-label="Loading camera"
    >
      <div className="h-8 w-8 rounded-full border-2 border-hairline-strong border-t-foreground animate-spin" />
      <div className="skeleton h-2 w-40 rounded-full" />
    </div>
  );
}
