"use client";

import Image from "next/image";
import type { DuplicateCandidate } from "@/app/report/actions";

interface DuplicateCheckProps {
  newPhotoDataUrl: string;
  candidate: DuplicateCandidate;
  onConfirm: () => void;
  onDeny: () => void;
  confirming: boolean;
}

function timeAgo(isoString: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(isoString).getTime()) / 1000,
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function DuplicateCheck({
  newPhotoDataUrl,
  candidate,
  onConfirm,
  onDeny,
  confirming,
}: DuplicateCheckProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background pb-safe">
      {/* Header */}
      <div className="flex-none px-5 pt-safe">
        <div className="mt-5 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
            <svg
              className="h-5 w-5 text-amber-600 dark:text-amber-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              Similar report nearby
            </h1>
            <p className="mt-0.5 text-sm text-faint">
              Someone may have already reported this issue
              {candidate.distance_m < 200
                ? `, ${candidate.distance_m}m away`
                : ""}
              .
            </p>
          </div>
        </div>
      </div>

      {/* Photos */}
      <div className="mt-5 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 sm:flex-row">
        {/* Existing report */}
        <div className="flex flex-1 flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-faint">
            Existing report
          </p>
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-800">
            <Image
              src={candidate.photo_public_url}
              alt="Existing report photo"
              fill
              className="object-cover"
              sizes="(min-width: 640px) 50vw, 100vw"
              unoptimized
            />
          </div>
          <div className="space-y-0.5">
            {candidate.address && (
              <p className="truncate text-sm text-foreground">
                {candidate.address}
              </p>
            )}
            <div className="flex items-center gap-2 text-xs text-faint">
              {candidate.category && (
                <span className="capitalize">
                  {candidate.category.replace(/_/g, " ")}
                </span>
              )}
              {candidate.category && <span>·</span>}
              <span>{timeAgo(candidate.created_at)}</span>
            </div>
          </div>
        </div>

        {/* New photo */}
        <div className="flex flex-1 flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-faint">
            Your photo
          </p>
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-800">
            {/* biome-ignore lint/performance/noImgElement: in-browser data URL, not a remote asset next/image can optimize. */}
            <img
              src={newPhotoDataUrl}
              alt="What you just captured"
              className="h-full w-full object-cover"
            />
          </div>
          <p className="text-xs text-faint">Just now</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex-none space-y-3 px-5 pb-6 pt-4">
        <p className="text-center text-sm text-foreground">
          Is this the same issue?
        </p>
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirming}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-4 py-4 text-base font-semibold text-white active:scale-[0.97] transition-transform disabled:opacity-60"
        >
          {confirming ? (
            <>
              <svg
                className="h-4 w-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Linking…
            </>
          ) : (
            "Yes, it’s the same issue"
          )}
        </button>
        <button
          type="button"
          onClick={onDeny}
          disabled={confirming}
          className="flex w-full items-center justify-center rounded-2xl border border-hairline bg-transparent px-4 py-4 text-base font-semibold text-foreground active:scale-[0.97] transition-transform disabled:opacity-60"
        >
          No, mine is different, submit anyway
        </button>
      </div>
    </div>
  );
}
