/* Segment-level skeleton for the whole /user/* tree. The layout awaits
   getAuthUser() before any child renders; this activates the Suspense boundary
   immediately so a cold Supabase connection shows a neutral shell instead of a
   blank screen. Per-route loading.tsx files (pulse, updates) override this with
   shape-matched skeletons where they exist. animate-pulse only. */
export default function UserLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-24 pb-[calc(5.5rem_+_env(safe-area-inset-bottom))] sm:px-6 md:pb-10 lg:px-8">
      <section className="mb-8 animate-pulse">
        <div className="h-3 w-28 rounded-full bg-overlay-strong" />
        <div className="mt-3 h-9 w-[min(380px,75%)] rounded-lg bg-overlay-strong" />
        <div className="mt-3 h-4 w-[min(320px,65%)] rounded bg-overlay" />
      </section>
      <div className="h-[320px] animate-pulse rounded-[14px] border border-hairline bg-surface" />
    </div>
  );
}
