/* Route-segment skeleton for /user/pulse. Mirrors the CommunityPulse bento
   shape (header + Band-1 7/5 split) so the page reserves layout space and the
   server-fetched morale data swaps in without a jump. animate-pulse only —
   no JS, runs instantly inside the Suspense boundary. */
export default function PulseLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-24 pb-[calc(5.5rem_+_env(safe-area-inset-bottom))] sm:px-6 md:pb-10 lg:px-8">
      <section className="mb-8 animate-pulse">
        <div className="h-3 w-32 rounded-full bg-overlay-strong" />
        <div className="mt-3 h-9 w-[min(420px,80%)] rounded-lg bg-overlay-strong" />
        <div className="mt-3 h-4 w-[min(340px,70%)] rounded bg-overlay" />
      </section>

      <div className="grid gap-4 lg:grid-cols-12 lg:items-stretch">
        <div className="h-[300px] animate-pulse rounded-[14px] border border-hairline bg-surface lg:col-span-7" />
        <div className="h-[300px] animate-pulse rounded-[14px] border border-hairline bg-surface lg:col-span-5" />
      </div>
    </div>
  );
}
