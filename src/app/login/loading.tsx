// Route-level skeleton for /login. Mirrors login-form.tsx so the swap to the
// real form is positionally stable — same brand lockup, auth card, provider
// CTAs, OR divider, demo box, and footer geometry (zero layout shift on
// hydrate). Instant static copy (heading, subtitle, "or", footer) renders as
// real text at the real weight — matching the members loader convention; only
// data/interaction-dependent controls ride the shared `.skeleton` shimmer
// (theme-aware, reduced-motion safe via globals.css).

// Demo quick-fill chips: 2 static personas + 11 operational teams (demo-auth.ts)
// — count kept in sync so the wrap grid reserves the real vertical height.
const DEMO_CHIP_KEYS = [
  "d1",
  "d2",
  "d3",
  "d4",
  "d5",
  "d6",
  "d7",
  "d8",
  "d9",
  "d10",
  "d11",
  "d12",
  "d13",
];

export default function LoginLoading() {
  return (
    <div
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-4 pt-[max(3rem,env(safe-area-inset-top,0px))] pb-[max(3rem,env(safe-area-inset-bottom,0px))] text-foreground"
      role="status"
      aria-busy="true"
      aria-label="Loading sign in"
    >
      {/* Brand lockup — accent logo square + "Civic" wordmark. */}
      <div className="relative z-10 mb-6 flex items-center gap-2 sm:mb-10">
        <div className="skeleton h-9 w-9 rounded-[var(--radius-md)]" />
        <div className="skeleton h-5 w-16 rounded" />
      </div>

      <div className="relative z-10 w-full max-w-[400px]">
        <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-5 sm:p-7">
          {/* Heading + subtitle — instant static copy at the real weight. */}
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
              Welcome back
            </h1>
            <p className="mt-1 text-[13px] text-[var(--color-muted)]">
              Sign in to report and follow civic issues.
            </p>
          </div>

          {/* Continue with Google (h-12 provider button). */}
          <div className="skeleton mt-6 h-12 w-full rounded-[var(--radius-md)]" />

          {/* OR divider — static label between hairline rails. */}
          <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.12em] text-[var(--color-muted)]">
            <span className="h-px flex-1 bg-hairline" />
            or
            <span className="h-px flex-1 bg-hairline" />
          </div>

          {/* Continue with email (h-11) + Continue as guest (h-11). */}
          <div className="skeleton h-11 w-full rounded-[var(--radius-md)]" />
          <div className="skeleton mt-3 h-11 w-full rounded-[var(--radius-md)]" />

          {/* Demo accounts box — mirrors DemoSignIn (bg-surface + border). */}
          <div className="mt-6 rounded-[var(--radius-lg)] border border-hairline bg-surface p-4">
            <div className="flex items-center justify-between">
              <div className="skeleton h-3 w-24 rounded" />
              <div className="skeleton h-5 w-12 rounded-full" />
            </div>

            {/* username + password inputs + submit (each h-11). */}
            <div className="mt-3 space-y-2.5">
              <div className="skeleton h-11 w-full rounded-[var(--radius-md)]" />
              <div className="skeleton h-11 w-full rounded-[var(--radius-md)]" />
              <div className="skeleton h-11 w-full rounded-[var(--radius-md)]" />
            </div>

            {/* Quick-fill label + persona chip grid. */}
            <div className="mt-3">
              <div className="skeleton h-2.5 w-14 rounded" />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {DEMO_CHIP_KEYS.map((k, i) => (
                  <div
                    key={k}
                    className={`skeleton h-6 rounded-[var(--radius-md)] ${
                      i % 3 === 0 ? "w-20" : "w-16"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer — signup prompt + terms, static copy at the real weight. */}
        <p className="mt-6 text-center text-[13px] text-[var(--color-muted)]">
          New to Civic?{" "}
          <span className="font-medium text-[var(--color-primary)]">
            Create an account
          </span>
        </p>
        <p className="mt-3 text-center text-[11px] leading-relaxed text-[var(--color-muted)]">
          By continuing you agree to Civic's{" "}
          <span className="font-medium text-foreground">Terms</span> and
          acknowledge the{" "}
          <span className="font-medium text-foreground">Privacy Policy</span>.
        </p>
      </div>
    </div>
  );
}
