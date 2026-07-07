import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { type DemoAccount, findDemoAccount } from "@/lib/demo-auth";

/* ==================================================================
   Demo session cookie signing — SERVER ONLY.

   The civic_demo_session cookie previously stored a bare username
   ("admintest"), so anyone could forge staff access by hand-setting
   `Cookie: civic_demo_session=admintest`. We now HMAC-sign the
   username with a server-only secret; only a value this server minted
   verifies. Format: `<username>.<hmac-sha256-hex>`.

   This lives in its own module (not demo-auth.ts) because demo-auth.ts
   is imported by the client demo sign-in form; pulling node:crypto into
   that module would break the browser bundle. Keep this file off any
   client import path — `server-only` enforces that at build time.

   Fail-closed: if DEMO_COOKIE_SECRET is unset, verification returns
   null (no demo session) instead of throwing, so a misconfigured
   deploy degrades to "no demo access", never to "everyone is staff".
   DEMO_COOKIE_SECRET must NOT be a NEXT_PUBLIC_* var — it is a secret.
   ================================================================== */

function getSecret(): string | null {
  const s = process.env.DEMO_COOKIE_SECRET;
  return s && s.length > 0 ? s : null;
}

function computeHmac(username: string, key: string): string {
  return createHmac("sha256", key).update(username).digest("hex");
}

/**
 * Signed cookie value for a username. When the secret is unset the value
 * is returned unsigned — verifyDemoSession rejects it, so the net effect
 * is fail-closed (the persona never authenticates) rather than a crash.
 */
export function signDemoSession(username: string): string {
  const key = getSecret();
  if (!key) return username;
  return `${username}.${computeHmac(username, key)}`;
}

/**
 * Verify a signed cookie value. Returns the username iff the signature is
 * present, well-formed, and matches (constant-time compare); null on an
 * unset secret, a missing/malformed signature, or any tampering.
 */
export function verifyDemoSession(
  raw: string | undefined | null,
): string | null {
  if (!raw) return null;
  const key = getSecret();
  if (!key) return null; // fail closed — no secret means no demo session

  const dot = raw.lastIndexOf(".");
  // Reject values with no separator, an empty username, or an empty sig.
  if (dot <= 0 || dot === raw.length - 1) return null;
  const username = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);

  const expected = computeHmac(username, key);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch — guard before comparing.
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  return username;
}

/**
 * Verify THEN resolve a demo persona from the raw cookie value. This is the
 * security-gated read path: any caller that makes an access decision (the
 * staff-access check, the grid gate) MUST use this instead of the bare
 * findDemoAccount, so a forged or unsigned cookie resolves to no persona.
 */
export function findVerifiedDemoAccount(
  raw: string | undefined | null,
): DemoAccount | null {
  return findDemoAccount(verifyDemoSession(raw));
}
