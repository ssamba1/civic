"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { MessageSquare, Send } from "lucide-react";
import { createBrowserSupabase } from "@/lib/db/browser-client";
import { addWorkOrderComment } from "@/app/staff/actions";

interface Comment {
  id: string;
  body: string;
  author_id: string;
  created_at: string;
}

interface WorkOrderCommentsProps {
  workOrderId: string;
}

export function WorkOrderComments({ workOrderId }: WorkOrderCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Fetch initial comments and subscribe to Realtime inserts
  useEffect(() => {
    const supabase = createBrowserSupabase();

    supabase
      .from("work_order_comments")
      .select("id, body, author_id, created_at")
      .eq("work_order_id", workOrderId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) setComments(data as Comment[]);
      });

    const channel = supabase
      .channel(`wo_comments_${workOrderId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "work_order_comments",
          filter: `work_order_id=eq.${workOrderId}`,
        },
        (payload) => {
          setComments((prev) => {
            const incoming = payload.new as Comment;
            // Deduplicate in case optimistic update already added it
            if (prev.some((c) => c.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workOrderId]);

  // Keep latest comment in view
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments.length]);

  function handleSubmit() {
    const text = draft.trim();
    if (!text) return;
    setError(null);
    setDraft("");
    startTransition(async () => {
      const result = await addWorkOrderComment(workOrderId, text);
      if (!result.ok) {
        setError(result.error);
        setDraft(text);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-zinc-400" />
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Staff Comments
        </p>
        {comments.length > 0 && (
          <span className="ml-auto text-xs text-zinc-400">{comments.length}</span>
        )}
      </div>

      {comments.length > 0 && (
        <div className="mb-3 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
          {comments.map((c) => (
            <div
              key={c.id}
              className="rounded-md bg-zinc-50 p-2.5 dark:bg-zinc-800"
            >
              <p className="text-sm text-zinc-800 dark:text-zinc-200">{c.body}</p>
              <p className="mt-1 text-xs text-zinc-400">
                {new Date(c.created_at).toLocaleString()}
              </p>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a comment… (⌘Enter / Ctrl+Enter to post)"
        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        rows={3}
        maxLength={2000}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={isPending || !draft.trim()}
        className="mt-2 flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        <Send className="h-3 w-3" />
        Post
      </button>
    </div>
  );
}
