"use client";

export default function AnalyticsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center px-4">
      <p className="text-sm font-medium text-subtle">
        Analytics failed to load.
      </p>
      {error.digest && (
        <p className="text-xs text-faint">Ref: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="rounded-full bg-[var(--color-primary)] px-5 py-2 text-[14px] font-medium text-white transition-colors hover:bg-[#0070e0]"
      >
        Try again
      </button>
    </div>
  );
}
