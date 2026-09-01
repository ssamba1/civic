"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, IntakeDraft } from "@/lib/ai/intake-chat";

// ── types ─────────────────────────────────────────────────────────────────────

interface ApiResponse {
  reply: string;
  draft?: IntakeDraft;
  done: boolean;
}

export interface ChatIntakeProps {
  /** Called when the model produces a confirmed draft. */
  onDraft: (draft: IntakeDraft) => void;
  /** Optional CSS class on the outer container. */
  className?: string;
}

// ── icons (inline SVG, no external dep) ──────────────────────────────────────

function SendIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

// ── component ─────────────────────────────────────────────────────────────────

const INITIAL_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "Hi! I'm here to help you report a local issue. What problem did you see? (For example: pothole, broken streetlight, graffiti, water leak, etc.)",
};

export function ChatIntake({ onDraft, className = "" }: ChatIntakeProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<IntakeDraft | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      // Only send user+assistant turns (skip the local-only initial prompt).
      const res = await fetch("/api/ai/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as ApiResponse;

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);

      if (data.done && data.draft) {
        setDraft(data.draft);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(`Something went wrong, please try again. (${msg})`);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  const handleUseDraft = useCallback(() => {
    if (draft) onDraft(draft);
  }, [draft, onDraft]);

  return (
    <div
      className={`flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm ${className}`}
    >
      {/* Header */}
      <div className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-800">Report an Issue</h2>
        <p className="text-xs text-gray-500">
          Tell us what you see, I&apos;ll help fill out the details.
        </p>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[260px] max-h-[420px]">
        {messages.map((msg, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: chat log is append-only, messages are never reordered
          <MessageBubble key={i} message={msg} />
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <span className="inline-flex gap-1">
              <span className="animate-bounce [animation-delay:0ms]">•</span>
              <span className="animate-bounce [animation-delay:150ms]">•</span>
              <span className="animate-bounce [animation-delay:300ms]">•</span>
            </span>
            <span>Thinking…</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Draft confirmation card */}
      {draft && (
        <div className="mx-4 mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
          <p className="font-medium text-blue-800 mb-1">Draft report ready</p>
          <dl className="space-y-0.5 text-blue-700">
            <div>
              <dt className="inline font-medium">Category: </dt>
              <dd className="inline capitalize">
                {draft.category.replace(/_/g, " ")}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">Description: </dt>
              <dd className="inline">{draft.description}</dd>
            </div>
            {draft.location_hint && (
              <div>
                <dt className="inline font-medium">Location: </dt>
                <dd className="inline">{draft.location_hint}</dd>
              </div>
            )}
            <div>
              <dt className="inline font-medium">Severity: </dt>
              <dd className="inline">{draft.severity_hint} / 5</dd>
            </div>
            {draft.needs_photo && (
              <div className="text-amber-700 font-medium mt-1">
                A photo will help staff address this issue.
              </div>
            )}
          </dl>
          <button
            type="button"
            onClick={handleUseDraft}
            className="mt-2 w-full rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Use this draft
          </button>
        </div>
      )}

      {/* Input bar */}
      <div className="border-t border-gray-100 px-3 py-2 flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading || !!draft}
          placeholder={draft ? "Draft confirmed above" : "Type your message…"}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
          aria-label="Chat message"
        />
        <button
          type="button"
          onClick={sendMessage}
          disabled={loading || !input.trim() || !!draft}
          aria-label="Send"
          className="rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <SendIcon />
        </button>
      </div>
    </div>
  );
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
          isUser
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-gray-100 text-gray-800 rounded-bl-sm"
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}
