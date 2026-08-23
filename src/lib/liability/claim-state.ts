import type { Result } from "@/lib/types";

/* ==================================================================
   Claim state machine (spec §5.2).

   Kept in its own module — NOT in claims-actions.ts — because a
   `"use server"` file may only export async functions, and these guards
   are synchronous pure functions that the actions (and their tests) call.

   The transition table is the single source of truth for what a staffer
   may do to a claim. Actions validate through requireTransition() before
   touching the row so an out-of-order UI click fails loudly instead of
   silently re-sending a claim that a contractor already accepted.
   ================================================================== */

export const CLAIM_STATES = [
  "draft",
  "approved",
  "sent",
  "accepted",
  "declined",
  "disputed",
  "resolved",
  "dismissed",
] as const;

export type ClaimState = (typeof CLAIM_STATES)[number];

/** Basis values mirrored from `claims.basis` / ClaimPacket.basis. */
export type ClaimBasis = "warranty" | "utility_restoration";

// Terminal states have no outgoing edges: once money is recovered or the city
// absorbs the cost, the claim is history and must stay reproducible.
const TRANSITIONS: Record<ClaimState, readonly ClaimState[]> = {
  draft: ["approved", "sent", "dismissed"],
  approved: ["sent", "dismissed"],
  // A contractor can respond, or staff can resolve directly (paid on receipt).
  sent: ["accepted", "declined", "resolved", "dismissed"],
  accepted: ["resolved", "disputed", "dismissed"],
  declined: ["disputed", "dismissed"],
  disputed: ["resolved", "dismissed"],
  resolved: [],
  dismissed: [],
};

export function isClaimState(value: unknown): value is ClaimState {
  return (
    typeof value === "string" &&
    (CLAIM_STATES as readonly string[]).includes(value)
  );
}

export function isTerminalState(state: ClaimState): boolean {
  return TRANSITIONS[state]?.length === 0;
}

/** True when `from → to` is a legal move. Unknown states are never legal. */
export function canTransition(from: ClaimState, to: ClaimState): boolean {
  if (!isClaimState(from) || !isClaimState(to)) return false;
  return TRANSITIONS[from].includes(to);
}

/**
 * Result-returning wrapper used by the server actions, so every rejected
 * transition surfaces the same message shape as the rest of the action layer.
 */
export function requireTransition(
  from: ClaimState,
  to: ClaimState,
): Result<ClaimState> {
  if (canTransition(from, to)) return { ok: true, data: to };
  return {
    ok: false,
    error: `Invalid claim transition: ${from} → ${to}`,
  };
}
