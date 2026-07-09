"use client";

/**
 * /city/[slug]/report/chat
 *
 * Standalone conversational intake page. The resident chats with the AI
 * assistant to produce a structured draft. On confirm, the draft is written to
 * sessionStorage and the user is forwarded to /report (the normal submit flow).
 *
 * sessionStorage key contract:
 *   Key:   "civic:intake-draft"
 *   Value: JSON-serialised IntakeDraft (see src/lib/ai/intake-chat.ts)
 *   TTL:   none — the report page must consume + clear it immediately on mount.
 *
 * See INTEGRATION-NOTES-chat.md at the repo root for full wiring details.
 *
 * NOTE: No PII in URLs — the draft travels via sessionStorage, not query params.
 */

import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import { ChatIntake } from "@/components/report/chat-intake";
import type { IntakeDraft } from "@/lib/ai/intake-chat";

// ── sessionStorage key ────────────────────────────────────────────────────────

/** Shared key used by this page (writer) and report/page.tsx (reader). */
export const INTAKE_DRAFT_SESSION_KEY = "civic:intake-draft";

// ── page ──────────────────────────────────────────────────────────────────────

export default function ChatIntakePage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";

  const handleDraft = useCallback(
    (draft: IntakeDraft) => {
      try {
        sessionStorage.setItem(INTAKE_DRAFT_SESSION_KEY, JSON.stringify(draft));
      } catch {
        // sessionStorage blocked (private browsing edge case) — proceed anyway.
        // The report page will just start with an empty form.
      }
      // Forward to the normal report flow. The slug is used to pre-select the
      // city, but the draft travels via sessionStorage (no PII in the URL).
      router.push(`/report?city=${encodeURIComponent(slug)}`);
    },
    [router, slug],
  );

  return (
    <main className="min-h-screen bg-gray-50 flex items-start justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        {/* Page heading */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">
            Report a Local Issue
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Describe what you see and our assistant will help draft your report.
            You&apos;ll be able to add photos and confirm before submitting.
          </p>
        </div>

        {/* Chat widget */}
        <ChatIntake onDraft={handleDraft} className="min-h-[480px]" />

        {/* Fallback link for users who prefer the standard form */}
        <p className="mt-4 text-center text-xs text-gray-500">
          Prefer the standard form?{" "}
          <a
            href={`/report${slug ? `?city=${encodeURIComponent(slug)}` : ""}`}
            className="underline hover:text-gray-700"
          >
            Skip the chat
          </a>
        </p>
      </div>
    </main>
  );
}
