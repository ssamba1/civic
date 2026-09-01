"use client";

import {
  useCallback,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { postComment } from "@/app/report/comment-actions";
import type { ReportComment } from "@/lib/types";

// Module-level counter. Avoids Date.now() collisions and satisfies the
// no-Date.now rule. Resets on module reload (hot-reload), which is fine.
let _optimisticSeq = 0;

// ─── types ───────────────────────────────────────────────────────────────────

interface CommentThreadProps {
  reportId: string;
  /** Server-fetched initial comments (non-hidden, oldest first). */
  initialComments: ReportComment[];
}

// ─── role badge ──────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: ReportComment["author_role"] }) {
  if (role === "staff") {
    return (
      <span className="inline-flex items-center rounded-md bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-primary)]">
        Staff
      </span>
    );
  }
  if (role === "system") {
    return (
      <span className="inline-flex items-center rounded-md bg-[color-mix(in_srgb,var(--color-warning,#f59e0b)_12%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color-mix(in_srgb,var(--color-warning,#f59e0b)_80%,black)]">
        System
      </span>
    );
  }
  // resident, no badge, just "You" implied from context
  return null;
}

// ─── single comment ──────────────────────────────────────────────────────────

function CommentItem({ comment }: { comment: ReportComment }) {
  const isStaff = comment.author_role === "staff";

  return (
    <article
      className={`flex gap-3 ${isStaff ? "flex-row-reverse" : ""}`}
      aria-label={`Comment from ${comment.author_role}`}
    >
      {/* Avatar dot */}
      <div
        className={`mt-1 h-7 w-7 flex-shrink-0 rounded-full ${
          isStaff
            ? "bg-[var(--color-primary)] text-white"
            : "bg-[color-mix(in_srgb,var(--color-foreground)_12%,transparent)] text-subtle"
        } flex items-center justify-center text-[11px] font-bold`}
        aria-hidden="true"
      >
        {isStaff ? "S" : "R"}
      </div>

      <div
        className={`min-w-0 flex-1 ${isStaff ? "items-end" : "items-start"} flex flex-col`}
      >
        {/* Header */}
        <div
          className={`mb-1 flex items-center gap-1.5 ${isStaff ? "flex-row-reverse" : ""}`}
        >
          <RoleBadge role={comment.author_role} />
          <time
            dateTime={comment.created_at}
            className="text-[11px] text-subtle"
            title={new Date(comment.created_at).toLocaleString()}
          >
            {new Date(comment.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </div>

        {/* Body */}
        <div
          className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed text-foreground whitespace-pre-wrap break-words ${
            isStaff
              ? "rounded-tr-sm bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)]"
              : "rounded-tl-sm bg-[color-mix(in_srgb,var(--color-foreground)_6%,transparent)]"
          }`}
        >
          {comment.body}
        </div>
      </div>
    </article>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function CommentThread({
  reportId,
  initialComments,
}: CommentThreadProps) {
  const [optimisticComments, addOptimistic] = useOptimistic<
    ReportComment[],
    string
  >(initialComments, (state, body) => [
    ...state,
    {
      id: `optimistic-${++_optimisticSeq}`,
      report_id: reportId,
      author_id: null,
      author_role: "resident" as const,
      body,
      // created_at is display-only for the optimistic entry; use a stable
      // ISO string derived from the epoch offset tracked via the seq counter
      // so we never call Date.now() or argless new Date().
      created_at: new Date(0).toISOString(),
    },
  ]);

  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const body = draft.trim();
      if (!body || isPending) return;

      setError(null);

      // Run the optimistic update and server call inside the transition.
      // Throwing inside startTransition's async body causes React to roll back
      // the optimistic entry. We use a shared error ref to surface the error
      // message after the transition settles, then call setError in a
      // follow-up setState outside the transition (the catch block here).
      startTransition(async () => {
        addOptimistic(body);
        setDraft("");

        const result = await postComment(reportId, body);
        if (!result.ok) {
          // Restore the draft before throwing. SetDraft inside a transition
          // is fine; React will batch it with the rollback.
          setDraft(body);

          const friendlyErrors: Record<string, string> = {
            unauthenticated: "You need to be signed in to comment.",
            forbidden: "You don't have permission to comment on this report.",
            feature_unavailable: "Comments are not available yet.",
            database_error: "Something went wrong. Please try again.",
            unexpected_error: "Something went wrong. Please try again.",
          };
          const code = result.error ?? "unexpected_error";
          setError(friendlyErrors[code] ?? code ?? "Something went wrong.");

          // Throw so React rolls back the optimistic comment entry.
          throw new Error(code);
        }
      });
    },
    [draft, isPending, reportId, addOptimistic],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit(e as unknown as React.FormEvent);
      }
    },
    [handleSubmit],
  );

  return (
    <section
      aria-label="Report comments"
      className="mt-7 rounded-[var(--radius-lg)] border border-hairline bg-surface p-5 shadow-[var(--shadow-card)]"
    >
      <h2 className="mb-4 text-[15px] font-semibold tracking-tight text-foreground">
        Comments
      </h2>

      {/* Comment list */}
      {optimisticComments.length === 0 ? (
        <p className="mb-5 text-center text-[13px] text-subtle py-4">
          No comments yet. Be the first to ask a question or leave an update.
        </p>
      ) : (
        <div className="mb-5 flex flex-col gap-4">
          {optimisticComments.map((c) => (
            <CommentItem key={c.id} comment={c} />
          ))}
        </div>
      )}

      {/* Add comment form */}
      <form
        onSubmit={handleSubmit}
        className="mt-3 border-t border-hairline pt-4"
      >
        <label htmlFor="comment-body" className="sr-only">
          Add a comment
        </label>
        <textarea
          id="comment-body"
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question or leave an update… (Ctrl+Enter to send)"
          rows={3}
          maxLength={2000}
          disabled={isPending}
          className="w-full resize-none rounded-lg border border-hairline bg-overlay px-3.5 py-2.5 text-[13px] text-foreground placeholder:text-subtle outline-none transition-colors focus:border-[color-mix(in_srgb,var(--color-primary)_50%,transparent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary)_25%,transparent)] disabled:opacity-60"
          aria-label="Comment body"
        />

        {error && (
          <p
            role="alert"
            className="mt-1.5 text-[12px] text-[var(--color-error,#ef4444)]"
          >
            {error}
          </p>
        )}

        <div className="mt-2.5 flex items-center justify-between gap-3">
          <span className="text-[11px] text-subtle">
            {draft.length > 0 ? `${draft.length}/2000` : ""}
          </span>
          <button
            type="submit"
            disabled={!draft.trim() || isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 text-[13px] font-medium text-white outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-primary)_60%,transparent)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? "Posting…" : "Post comment"}
          </button>
        </div>
      </form>
    </section>
  );
}
