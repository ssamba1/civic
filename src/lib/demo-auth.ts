import { TEAM_LIST, type TeamId } from "@/lib/teams";

/* ==================================================================
   Demo personas — hackathon sign-in.

   DEMO ONLY. These are plaintext credentials baked into the bundle so a
   presenter can log in as each surface (resident, city admin, any team)
   without a real auth backend. They gate NOTHING sensitive — routing is
   soft (login drops you at the persona's home; every URL stays open) and
   the cookie only records which persona is active for the header label +
   logout. Never reuse this pattern for real authentication.
   ================================================================== */

export type DemoRole = "user" | "admin" | "team";

export interface DemoAccount {
  username: string;
  /** DEMO ONLY — plaintext, not real auth. */
  password: string;
  role: DemoRole;
  /** Present iff role === "team". */
  teamId?: TeamId;
  /** Post-login redirect target. */
  home: string;
  /** Human label for the persona picker + header. */
  label: string;
}

export const DEMO_SESSION_COOKIE = "civic_demo_session";

/** The only live city in KNOWN_CITIES — every persona is scoped here. */
const DEMO_CITY = "cumming";

const STATIC_ACCOUNTS: DemoAccount[] = [
  {
    username: "usertest",
    password: "usertest",
    role: "user",
    home: "/user/pulse",
    label: "Resident",
  },
  {
    username: "admintest",
    password: "admintest",
    role: "admin",
    home: `/city/${DEMO_CITY}`,
    label: "City Admin",
  },
];

// One account per operational team, numbered teamtest1..N in TEAM_LIST order
// (excluding the "all" admin pseudo-team). Generated so the mapping has a
// single source of truth — adding a team to TEAMS adds an account automatically.
const TEAM_ACCOUNTS: DemoAccount[] = TEAM_LIST.filter(
  (t) => t.id !== "all",
).map((t, i) => ({
  username: `teamtest${i + 1}`,
  password: "teamtest",
  role: "team" as const,
  teamId: t.id,
  home: `/${t.id}/${DEMO_CITY}`,
  label: t.shortLabel,
}));

export const DEMO_ACCOUNTS: DemoAccount[] = [
  ...STATIC_ACCOUNTS,
  ...TEAM_ACCOUNTS,
];

/** Validate a username/password pair. Returns the account or null. */
export function authenticateDemo(
  username: string,
  password: string,
): DemoAccount | null {
  const u = username.trim().toLowerCase();
  const account = DEMO_ACCOUNTS.find((a) => a.username === u);
  if (!account || account.password !== password) return null;
  return account;
}

/** Look up an account by username (for resolving a session cookie). */
export function findDemoAccount(
  username: string | undefined | null,
): DemoAccount | null {
  if (!username) return null;
  return DEMO_ACCOUNTS.find((a) => a.username === username) ?? null;
}
