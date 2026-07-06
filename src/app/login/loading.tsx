export default function LoginLoading() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[var(--background)] px-4 pt-[max(3rem,env(safe-area-inset-top,0px))] pb-[max(3rem,env(safe-area-inset-bottom,0px))] text-[var(--foreground)]">
      <div className="relative z-10 mb-6 flex animate-pulse items-center gap-2 sm:mb-10">
        <div className="h-9 w-9 rounded-xl bg-[var(--color-border)]" />
        <div className="h-5 w-16 rounded bg-[var(--color-border)]" />
      </div>

      <div className="relative z-10 w-full max-w-[400px]">
        <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-5 sm:p-7">
          <div className="animate-pulse space-y-2">
            <div className="h-5 w-36 rounded bg-[var(--color-border)]" />
            <div className="h-3.5 w-56 rounded bg-[var(--color-border)]/70" />
          </div>

          <div className="mt-6 h-12 w-full animate-pulse rounded-[var(--radius-md)] bg-[var(--color-border)]" />

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-[var(--color-border)]" />
            <span className="h-2 w-6 animate-pulse rounded bg-[var(--color-border)]/70" />
            <span className="h-px flex-1 bg-[var(--color-border)]" />
          </div>

          <div className="h-11 w-full animate-pulse rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-border)]/40" />
          <div className="mt-3 h-11 w-full animate-pulse rounded-[var(--radius-md)] bg-[var(--color-border)]/30" />

          <div className="mt-6 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--background)]/40 p-4">
            <div className="h-3 w-28 animate-pulse rounded bg-[var(--color-border)]/70" />
            <div className="mt-3 space-y-2.5">
              <div className="h-11 w-full animate-pulse rounded-xl bg-[var(--color-border)]/40" />
              <div className="h-11 w-full animate-pulse rounded-xl bg-[var(--color-border)]/40" />
              <div className="h-11 w-full animate-pulse rounded-xl bg-[var(--color-border)]/50" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
