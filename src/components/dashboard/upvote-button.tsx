"use client";

import { useState, useTransition } from "react";
import { ChevronUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { toggleUpvote } from "@/lib/upvote-actions";
import { cn } from "@/lib/utils/cn";

interface UpvoteButtonProps {
  reportId: string;
  count: number;
  upvoted: boolean;
}

export function UpvoteButton({ reportId, count, upvoted }: UpvoteButtonProps) {
  const [optCount, setOptCount] = useState(count);
  const [optUp, setOptUp] = useState(upvoted);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !optUp;
    // optimistic
    setOptUp(next);
    setOptCount((c) => c + (next ? 1 : -1));
    startTransition(async () => {
      const res = await toggleUpvote(reportId);
      if (!res.ok) {
        // revert
        setOptUp(!next);
        setOptCount((c) => c + (next ? -1 : 1));
        if (res.error === "unauthenticated") {
          router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
        }
      } else {
        setOptUp(res.data.upvoted);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={optUp}
      aria-label={optUp ? "Remove upvote" : "Upvote this report"}
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors flex-shrink-0 disabled:opacity-60",
        optUp
          ? "border-blue-300 bg-blue-50 text-blue-700"
          : "border-zinc-200 bg-white text-zinc-500 hover:border-blue-200 hover:text-blue-600"
      )}
    >
      <ChevronUp className="h-4 w-4" />
      {optCount}
    </button>
  );
}
