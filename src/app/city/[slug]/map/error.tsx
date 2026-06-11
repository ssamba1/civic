'use client';

export default function MapError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center px-4">
      <p className="text-sm font-medium text-zinc-400">Map failed to load.</p>
      {error.digest && (
        <p className="text-xs text-zinc-600">Ref: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="rounded-full bg-[#0a84ff] px-5 py-2 text-[14px] font-medium text-white transition-colors hover:bg-[#0070e0]"
      >
        Try again
      </button>
    </div>
  );
}
