// Route-level loading skeleton for the staff map. The map orchestrator fills the
// full viewport, so the fallback is a single full-height pulsing panel with a
// faint centered marker hint to signal "map loading" rather than blank white.
export default function StaffMapLoading() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-zinc-100 dark:bg-zinc-900">
      <div className="absolute inset-0 animate-pulse bg-zinc-100 dark:bg-zinc-900" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-3 w-3 animate-ping rounded-full bg-zinc-300 dark:bg-zinc-700" />
      </div>
    </div>
  );
}
