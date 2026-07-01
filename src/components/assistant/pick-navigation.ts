import type { UIMessage } from "ai";

export interface PendingNavigation {
  /** toolCallId — stable, so the widget fires each navigation exactly once. */
  key: string;
  route: string;
}

/**
 * Scan messages (latest first) for a completed navigateTo tool output and
 * return the route to push, or null. Pure so the widget can dedupe on `key`.
 */
export function pickPendingNavigation(
  messages: UIMessage[],
): PendingNavigation | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const parts = messages[i]?.parts ?? [];
    for (let j = parts.length - 1; j >= 0; j--) {
      const part = parts[j] as {
        type?: string;
        state?: string;
        toolCallId?: string;
        output?: { navigate?: string };
      };
      if (
        part.type === "tool-navigateTo" &&
        part.state === "output-available" &&
        typeof part.output?.navigate === "string" &&
        part.toolCallId
      ) {
        return { key: part.toolCallId, route: part.output.navigate };
      }
    }
  }
  return null;
}
