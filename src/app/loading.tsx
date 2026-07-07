/** Route-level skeleton: holds the nav + hero shape while the home RSC resolves. */
export default function Loading() {
  return (
    <div
      className="flex min-h-[100dvh] flex-col"
      style={{ backgroundColor: "#06080f" }}
      aria-hidden
    >
      {/* nav silhouette */}
      <header className="absolute inset-x-0 top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6 sm:px-8 lg:px-12">
          <div className="h-5 w-16 animate-pulse rounded-full bg-overlay-strong" />
          <div className="flex items-center gap-3">
            <div className="hidden h-4 w-20 animate-pulse rounded-full bg-overlay-strong sm:block" />
            <div className="hidden h-4 w-20 animate-pulse rounded-full bg-overlay-strong sm:block" />
            <div className="h-8 w-20 animate-pulse rounded-full bg-overlay-strong" />
          </div>
        </div>
      </header>

      {/* hero shimmer — mirrors the asymmetric 5/6 split */}
      <section className="relative isolate border-b border-hairline lg:min-h-[calc(100dvh-3.5rem)]">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 pb-10 pt-24 sm:px-8 lg:px-12 sm:pb-14 sm:pt-28 lg:grid-cols-[5fr_6fr] lg:min-h-[calc(100dvh-3.5rem)] lg:items-center">
          <div className="flex flex-col justify-center gap-5">
            <div className="h-7 w-44 animate-pulse rounded-full bg-overlay-strong" />
            <div className="mt-2 space-y-3">
              <div className="h-12 w-4/5 animate-pulse rounded-lg bg-overlay-strong" />
              <div className="h-12 w-3/5 animate-pulse rounded-lg bg-overlay-strong" />
            </div>
            <div className="mt-2 space-y-2">
              <div className="h-4 w-full max-w-md animate-pulse rounded-full bg-overlay-strong" />
              <div className="h-4 w-4/5 max-w-md animate-pulse rounded-full bg-overlay-strong" />
              <div className="h-4 w-2/3 max-w-md animate-pulse rounded-full bg-overlay-strong" />
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <div className="h-12 w-full animate-pulse rounded-full bg-overlay-strong sm:w-44" />
              <div className="h-12 w-full animate-pulse rounded-full bg-overlay-strong sm:w-56" />
            </div>
            <div className="mt-8 flex flex-wrap gap-8 border-t border-hairline pt-7">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-6 w-28 animate-pulse rounded-full bg-overlay-strong"
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center">
            <div className="aspect-square w-full max-w-[min(68vw,360px)] animate-pulse rounded-full bg-overlay-strong sm:max-w-[400px] lg:max-w-none" />
          </div>
        </div>
      </section>
    </div>
  );
}
