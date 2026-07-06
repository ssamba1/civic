"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageCircle, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LiquidGlassCard } from "@/components/ui/liquid-glass";
import { AssistantMessage } from "./assistant-message";
import { pickPendingNavigation } from "./pick-navigation";

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const router = useRouter();
  const navigatedKey = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/ai/chat" }),
  });

  // Fire each navigateTo exactly once (dedupe on toolCallId).
  useEffect(() => {
    const pending = pickPendingNavigation(messages);
    if (pending && pending.key !== navigatedKey.current) {
      navigatedKey.current = pending.key;
      router.push(pending.route);
    }
  }, [messages, router]);

  // Autoscroll to the latest message.
  // biome-ignore lint/correctness/useExhaustiveDependencies: effect intentionally re-runs on messages change to autoscroll; body reads only the ref
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const busy = status === "submitted" || status === "streaming";

  function submit() {
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-4 z-50 sm:bottom-6">
      {open ? (
        <LiquidGlassCard
          blurIntensity="xl"
          className="flex h-[28rem] w-[min(22rem,calc(100vw-2rem))] flex-col"
          contentClassName="flex h-full flex-col"
        >
          <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-faint">
              Ask Civic
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close help"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </header>

          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
          >
            {messages.length === 0 ? (
              <p className="text-sm text-subtle">
                Ask how Civic works, check your reports, or say “take me to
                report a problem.”
              </p>
            ) : (
              messages.map((m) => <AssistantMessage key={m.id} message={m} />)
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-hairline px-3 py-2">
            <input
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Ask a question…"
              className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-faint"
            />
            <Button
              type="button"
              aria-label="Send"
              size="icon"
              onClick={submit}
              disabled={busy || input.trim().length === 0}
            >
              <Send className="size-4" />
            </Button>
          </div>
        </LiquidGlassCard>
      ) : (
        <button
          type="button"
          aria-label="Open Civic help"
          onClick={() => setOpen(true)}
          className="flex size-14 items-center justify-center rounded-[var(--radius-lg)] bg-accent text-accent-contrast shadow-[var(--shadow-pop)] transition hover:bg-[var(--color-primary-hover)] active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <MessageCircle className="size-6" />
        </button>
      )}
    </div>
  );
}
