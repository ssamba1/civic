"use client";

import type { UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils/cn";

const TOOL_LABEL: Record<string, string> = {
  "tool-searchHelpDocs": "Searching help…",
  "tool-getMyReports": "Looking up your reports…",
  "tool-getReportStatus": "Checking that report…",
  "tool-getCityStats": "Reading city stats…",
  "tool-navigateTo": "Opening a screen…",
};

export function AssistantMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
          isUser
            ? "bg-[var(--color-primary)] text-white"
            : "bg-white/5 text-[var(--color-foreground)]",
        )}
      >
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: message parts stream append-only with no stable id; positional key is correct here
                key={`${message.id}-t${i}`}
                className="prose prose-invert prose-sm max-w-none [&_p]:my-1"
              >
                <ReactMarkdown>{part.text}</ReactMarkdown>
              </div>
            );
          }
          if (typeof part.type === "string" && part.type.startsWith("tool-")) {
            const label = TOOL_LABEL[part.type];
            const done =
              (part as { state?: string }).state === "output-available";
            if (!label || done) return null;
            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: message parts stream append-only with no stable id; positional key is correct here
                key={`${message.id}-tool${i}`}
                className="my-1 text-xs italic text-[var(--color-muted)]"
              >
                {label}
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
