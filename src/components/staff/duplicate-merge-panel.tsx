"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  findDuplicateCandidates,
  mergeReports,
  unmergeReports,
} from "@/app/staff/merge-actions";
import type { ScoredCandidate } from "@/lib/staff/merge";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function ScoreBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-blue-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right tabular-nums text-muted-foreground">
        {pct}%
      </span>
    </div>
  );
}

// ─── CandidateCard ────────────────────────────────────────────────────────────

interface CandidateCardProps {
  candidate: ScoredCandidate;
  onMerge: (candidate: ScoredCandidate) => void;
  merging: boolean;
}

function CandidateCard({ candidate, onMerge, merging }: CandidateCardProps) {
  const [expanded, setExpanded] = useState(false);
  const score = Math.round(candidate.score * 100);
  const scoreColor =
    score >= 80
      ? "text-red-600 dark:text-red-400"
      : score >= 60
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400";

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Category + address */}
          <div className="flex flex-wrap items-center gap-1.5">
            {candidate.category && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                {candidate.category.replace(/_/g, " ")}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {timeAgo(candidate.created_at)}
            </span>
            <span className="text-xs text-muted-foreground">
              &middot; {Math.round(candidate.distance_m)} m away
            </span>
          </div>
          {candidate.address && (
            <p className="mt-1 truncate text-sm">{candidate.address}</p>
          )}
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            {candidate.id}
          </p>
        </div>

        {/* Similarity badge */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className={`text-lg font-semibold tabular-nums ${scoreColor}`}
            title="Composite similarity score"
          >
            {score}%
          </span>
          <button
            type="button"
            className="text-xs text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Less" : "Details"}
          </button>
        </div>
      </div>

      {/* Score breakdown */}
      {expanded && (
        <div className="mt-3 space-y-1.5 rounded-md bg-muted/50 p-3">
          <ScoreBar
            value={candidate.score_breakdown.location}
            label="Location"
          />
          <ScoreBar value={candidate.score_breakdown.visual} label="Visual" />
          <ScoreBar
            value={candidate.score_breakdown.category}
            label="Category"
          />
          <ScoreBar value={candidate.score_breakdown.time} label="Time" />
        </div>
      )}

      {/* Merge button */}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={merging}
          onClick={() => onMerge(candidate)}
          className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {merging ? "Merging..." : "Merge into current"}
        </button>
      </div>
    </div>
  );
}

// ─── MergeConfirmDialog ───────────────────────────────────────────────────────

interface ConfirmDialogProps {
  candidate: ScoredCandidate;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  pending: boolean;
}

function MergeConfirmDialog({
  candidate,
  onConfirm,
  onCancel,
  pending,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Confirm merge</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Report <span className="font-mono">{candidate.id}</span> will be
          marked as a duplicate and hidden from the public dashboard. This
          action can be undone by an admin.
        </p>

        <label
          htmlFor="merge-reason"
          className="mt-4 block text-sm font-medium"
        >
          Reason (optional)
        </label>
        <textarea
          id="merge-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Same pothole, resident submitted twice from different angles"
          className="mt-1 w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />

        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            disabled={pending}
            className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Merging..." : "Confirm merge"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DuplicateMergePanel (main export) ───────────────────────────────────────

interface DuplicateMergePanelProps {
  /** The canonical report ID, the one that will SURVIVE the merge. */
  reportId: string;
  /** Pre-loaded candidates (optional). If omitted, panel loads them on mount. */
  initialCandidates?: ScoredCandidate[];
}

export default function DuplicateMergePanel({
  reportId,
  initialCandidates,
}: DuplicateMergePanelProps) {
  const [candidates, setCandidates] = useState<ScoredCandidate[]>(
    initialCandidates ?? [],
  );
  const [loaded, setLoaded] = useState(!!initialCandidates);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ScoredCandidate | null>(
    null,
  );
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadCandidates = useCallback(() => {
    setLoaded(false);
    setLoadError(null);
    startTransition(async () => {
      const result = await findDuplicateCandidates(reportId);
      if (result.ok) {
        setCandidates(result.data);
      } else {
        setLoadError(result.error);
      }
      setLoaded(true);
    });
  }, [reportId]);

  // Load on first mount if no initialCandidates provided.
  // Previously this was a render-phase setState (fired during render body),
  // which caused a double DB call under React strict mode due to the
  // double-invoke of render functions.  A useEffect with an empty dep array
  // runs once after mount and is the correct pattern for one-time side effects.
  useEffect(() => {
    if (!initialCandidates) {
      loadCandidates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadCandidates, initialCandidates]);

  const handleMergeClick = (candidate: ScoredCandidate) => {
    setConfirmTarget(candidate);
    setSuccessMsg(null);
    setErrorMsg(null);
  };

  const handleConfirm = (reason: string) => {
    if (!confirmTarget) return;
    const targetId = confirmTarget.id;
    setConfirmTarget(null);
    startTransition(async () => {
      const result = await mergeReports(reportId, targetId, reason);
      if (result.ok) {
        setCandidates((prev) => prev.filter((c) => c.id !== targetId));
        setSuccessMsg(`Report ${targetId} merged successfully.`);
      } else {
        setErrorMsg(`Merge failed: ${result.error}`);
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Duplicate candidates</h3>
          <p className="text-xs text-muted-foreground">
            Reports within 200 m &middot; last 90 days &middot; ranked by
            similarity
          </p>
        </div>
        <button
          type="button"
          onClick={loadCandidates}
          disabled={isPending}
          className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          {isPending ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* Feedback messages */}
      {successMsg && (
        <div className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          {errorMsg}
        </div>
      )}
      {loadError && (
        <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          Could not load candidates: {loadError}
        </div>
      )}

      {/* Loading state */}
      {!loaded && !loadError && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Searching for duplicates...
        </div>
      )}

      {/* Empty state */}
      {loaded && candidates.length === 0 && !loadError && (
        <div className="rounded-lg border border-dashed py-10 text-center">
          <p className="text-sm font-medium">No duplicates detected</p>
          <p className="mt-1 text-xs text-muted-foreground">
            No nearby open reports found within the search radius.
          </p>
        </div>
      )}

      {/* Candidate list */}
      {candidates.length > 0 && (
        <ul className="space-y-3">
          {candidates.map((c) => (
            <li key={c.id}>
              <CandidateCard
                candidate={c}
                onMerge={handleMergeClick}
                merging={isPending}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Confirm dialog */}
      {confirmTarget && (
        <MergeConfirmDialog
          candidate={confirmTarget}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmTarget(null)}
          pending={isPending}
        />
      )}
    </div>
  );
}

// ─── UnmergeButton (small helper for report detail views) ────────────────────

interface UnmergeButtonProps {
  mergedReportId: string;
  onSuccess?: () => void;
}

export function UnmergeButton({
  mergedReportId,
  onSuccess,
}: UnmergeButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleUnmerge = () => {
    setError(null);
    startTransition(async () => {
      const result = await unmergeReports(mergedReportId);
      if (result.ok) {
        setDone(true);
        onSuccess?.();
      } else {
        setError(result.error);
      }
    });
  };

  if (done) {
    return (
      <span className="text-sm text-emerald-600 dark:text-emerald-400">
        Report restored to open.
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleUnmerge}
        disabled={isPending}
        className="rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
      >
        {isPending ? "Restoring..." : "Undo merge"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
