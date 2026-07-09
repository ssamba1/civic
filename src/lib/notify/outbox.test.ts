import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeliveryResult } from "@/lib/notify/deliver";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

// Capture the patch handed to notifications.update(), and control the row the
// select chain resolves to, so each test can assert the exact bookkeeping.
const state = vi.hoisted(() => ({
  row: { id: "n1" } as { id: string } | null,
  captured: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/db/client", () => ({
  createServerClient: () => ({
    from: () => {
      const selectChain = {
        select: () => selectChain,
        eq: () => selectChain,
        is: () => selectChain,
        order: () => selectChain,
        limit: () => selectChain,
        maybeSingle: async () => ({ data: state.row, error: null }),
      };
      return {
        ...selectChain,
        update: (patch: Record<string, unknown>) => {
          state.captured = patch;
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  }),
}));

import { isTerminal, stampNotificationOutcome } from "./outbox";

beforeEach(() => {
  state.row = { id: "n1" };
  state.captured = null;
});

describe("isTerminal — retry classification", () => {
  it.each([
    [{ sent: true, reason: "ok" }, true],
    [{ sent: false, reason: "no-recipient" }, true],
    [{ sent: false, reason: "disabled" }, true],
    [{ sent: false, reason: "no-key" }, true],
    [{ sent: false, reason: "send-error" }, false],
  ] as [DeliveryResult, boolean][])("%o → terminal=%s", (result, expected) => {
    expect(isTerminal(result)).toBe(expected);
  });
});

describe("stampNotificationOutcome", () => {
  it("stamps delivered_at on a successful send", async () => {
    await stampNotificationOutcome("r1", "closed", {
      sent: true,
      reason: "ok",
    });
    expect(state.captured?.delivered_at).toBeTruthy();
    expect(state.captured?.delivery_error).toBeNull();
  });

  it("leaves delivered_at unset on a transient send-error (drain retries)", async () => {
    await stampNotificationOutcome("r1", "closed", {
      sent: false,
      reason: "send-error",
    });
    expect(state.captured).not.toBeNull();
    expect("delivered_at" in (state.captured ?? {})).toBe(false);
    expect(state.captured?.delivery_error).toBe("send-error");
  });

  it("stamps delivered_at for a terminal no-recipient (anon reporter drops out)", async () => {
    await stampNotificationOutcome("r1", "closed", {
      sent: false,
      reason: "no-recipient",
    });
    expect(state.captured?.delivered_at).toBeTruthy();
    expect(state.captured?.delivery_error).toBe("no-recipient");
  });

  it("no-ops for a non-'closed' status (no single-row type mapping)", async () => {
    await stampNotificationOutcome("r1", "dispatched", {
      sent: true,
      reason: "ok",
    });
    expect(state.captured).toBeNull();
  });

  it("no-ops when no undelivered row exists (un-migrated / already stamped)", async () => {
    state.row = null;
    await stampNotificationOutcome("r1", "closed", {
      sent: true,
      reason: "ok",
    });
    expect(state.captured).toBeNull();
  });
});
