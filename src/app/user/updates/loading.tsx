/* Route-segment skeleton for /user/updates. Mirrors the page header plus the
   NotificationsFeed card shell (rounded-[14px] border container with a filter
   header row and 5 feed rows) so the feed swaps in without an abrupt layout
   shift. animate-pulse only — instant inside the Suspense boundary. */
export default function UpdatesLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-24 pb-[calc(5.5rem_+_env(safe-area-inset-bottom))] sm:px-6 md:pb-10">
      <section className="mb-6 animate-pulse">
        <div className="h-3 w-28 rounded-full bg-overlay-strong" />
        <div className="mt-3 h-9 w-44 rounded-lg bg-overlay-strong" />
        <div className="mt-3 h-4 w-[min(360px,75%)] rounded bg-overlay" />
      </section>

      <section className="rounded-[14px] border border-hairline bg-surface shadow-[var(--shadow-card)]">
        <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <div className="h-7 w-32 animate-pulse rounded-full bg-overlay-strong" />
          <div className="h-4 w-20 animate-pulse rounded bg-overlay" />
        </header>
        <ul className="divide-y divide-hairline">
          {[0, 1, 2, 3, 4].map((i) => (
            <li
              key={i}
              className="flex items-start gap-3 px-4 py-3.5"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="h-7 w-7 flex-shrink-0 animate-pulse rounded-lg bg-overlay-strong" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3.5 w-[60%] animate-pulse rounded bg-overlay-strong" />
                <div className="h-3 w-[85%] animate-pulse rounded bg-overlay" />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
