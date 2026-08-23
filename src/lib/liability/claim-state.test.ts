import { describe, expect, it } from "vitest";
import {
  CLAIM_STATES,
  type ClaimState,
  canTransition,
  isTerminalState,
  requireTransition,
} from "./claim-state";

describe("canTransition", () => {
  it("allows the approve path only out of draft/approved", () => {
    expect(canTransition("draft", "sent")).toBe(true);
    expect(canTransition("approved", "sent")).toBe(true);
    expect(canTransition("sent", "sent")).toBe(false);
    expect(canTransition("accepted", "sent")).toBe(false);
    expect(canTransition("resolved", "sent")).toBe(false);
    expect(canTransition("dismissed", "sent")).toBe(false);
  });

  it("allows contractor responses only after the claim was sent", () => {
    expect(canTransition("sent", "accepted")).toBe(true);
    expect(canTransition("sent", "declined")).toBe(true);
    expect(canTransition("draft", "accepted")).toBe(false);
    expect(canTransition("draft", "declined")).toBe(false);
  });

  it("allows disputes only from a contractor response", () => {
    expect(canTransition("declined", "disputed")).toBe(true);
    expect(canTransition("accepted", "disputed")).toBe(true);
    expect(canTransition("draft", "disputed")).toBe(false);
    expect(canTransition("sent", "disputed")).toBe(false);
  });

  it("allows resolution from sent, accepted and disputed", () => {
    expect(canTransition("sent", "resolved")).toBe(true);
    expect(canTransition("accepted", "resolved")).toBe(true);
    expect(canTransition("disputed", "resolved")).toBe(true);
    expect(canTransition("draft", "resolved")).toBe(false);
    expect(canTransition("dismissed", "resolved")).toBe(false);
  });

  it("allows dismissal from every non-terminal state", () => {
    expect(canTransition("draft", "dismissed")).toBe(true);
    expect(canTransition("approved", "dismissed")).toBe(true);
    expect(canTransition("sent", "dismissed")).toBe(true);
    expect(canTransition("declined", "dismissed")).toBe(true);
    expect(canTransition("disputed", "dismissed")).toBe(true);
  });

  it("treats resolved and dismissed as terminal", () => {
    expect(isTerminalState("resolved")).toBe(true);
    expect(isTerminalState("dismissed")).toBe(true);
    for (const to of CLAIM_STATES) {
      expect(canTransition("resolved", to)).toBe(false);
      expect(canTransition("dismissed", to)).toBe(false);
    }
  });

  it("never allows a self-transition", () => {
    for (const state of CLAIM_STATES) {
      expect(canTransition(state, state)).toBe(false);
    }
  });

  it("rejects unknown states instead of throwing", () => {
    expect(canTransition("bogus" as ClaimState, "sent")).toBe(false);
    expect(canTransition("draft", "bogus" as ClaimState)).toBe(false);
  });
});

describe("requireTransition", () => {
  it("returns ok for a legal transition", () => {
    expect(requireTransition("draft", "sent")).toEqual({
      ok: true,
      data: "sent",
    });
  });

  it("returns a readable error naming both states", () => {
    const result = requireTransition("resolved", "sent");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toContain("resolved");
    expect(result.error).toContain("sent");
  });
});
