import { DEFAULT_CREW_TYPES } from "@/lib/crew-types";
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

export type DemoRole = "user" | "admin" | "team" | "crew";

export interface DemoAccount {
  username: string;
  /** DEMO ONLY — plaintext, not real auth. */
  password: string;
  role: DemoRole;
  /** Present iff role === "team". */
  teamId?: TeamId;
  /** Present iff role === "crew". */
  crewType?: string;
  /** Post-login redirect target. */
  home: string;
  /** Human label for the persona picker + header. */
  label: string;
}

export const DEMO_SESSION_COOKIE = "civic_demo_session";

/** The only live city in KNOWN_CITIES — every persona is scoped here. Exported
 *  so surfaces that stay public for the demo city (e.g. the city work-order grid)
 *  can gate every OTHER city behind staff auth against a single source of truth. */
export const DEMO_CITY = "cumming";

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
  home: `/city/${DEMO_CITY}/team/${t.id}`,
  label: t.shortLabel,
}));

// One account per built-in crew type, crewtest1..N — same single-source-of-
// truth pattern as TEAM_ACCOUNTS: adding a default crew type adds a login.
const CREW_ACCOUNTS: DemoAccount[] = DEFAULT_CREW_TYPES.map((t, i) => ({
  username: `crewtest${i + 1}`,
  password: "crewtest",
  role: "crew" as const,
  crewType: t.key,
  home: `/city/${DEMO_CITY}/crew/${t.key}`,
  label: `${t.label} Crew`,
}));

// One account per SEEDED crew instance (not just crew type) — lands on that
// crew's own portal via the ?crew=<exact name> instance scope (see
// src/app/city/[slug]/crew/[crewType]/page.tsx, which resolves the query
// param against fetchCityCrews() by case-sensitive name + crewType match).
// MUST stay in sync with CREW_ROSTER in supabase/seed/demo-crews.mjs — same
// names/crew_type values, else the login lands on a real portal but the
// ?crew= scope silently fails to resolve (falls back to the type-level view).
export const CREW_UNIT_ROSTER: {
  username: string;
  name: string;
  crewType: string;
}[] = [
  {
    username: "northsidellc",
    name: "Northside Paving LLC",
    crewType: "paving",
  },
  { username: "northpaving", name: "North Paving Crew", crewType: "paving" },
  { username: "southpaving", name: "South Paving Crew", crewType: "paving" },
  { username: "flatwork", name: "Flatwork Crew", crewType: "concrete" },
  {
    username: "stormdrain",
    name: "Storm Drain Crew",
    crewType: "drain_crew",
  },
  { username: "nightline", name: "Night Line Crew", crewType: "line_crew" },
  {
    username: "signcrew",
    name: "Signal & Sign Crew",
    crewType: "sign_crew",
  },
  { username: "forestry", name: "Forestry Crew", crewType: "arborist" },
  { username: "beautify", name: "Beautification Crew", crewType: "cleanup" },
];

const CREW_UNIT_ACCOUNTS: DemoAccount[] = CREW_UNIT_ROSTER.map((c) => ({
  username: c.username,
  password: "crewtest",
  role: "crew" as const,
  crewType: c.crewType,
  home: `/city/${DEMO_CITY}/crew/${c.crewType}?crew=${encodeURIComponent(c.name)}`,
  label: c.name,
}));

export const DEMO_ACCOUNTS: DemoAccount[] = [
  ...STATIC_ACCOUNTS,
  ...TEAM_ACCOUNTS,
  ...CREW_ACCOUNTS,
  ...CREW_UNIT_ACCOUNTS,
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

/** Look up an account by username. PURE resolver — takes a username, not a
 *  raw cookie: it does NOT verify the cookie's HMAC signature, so it is not a
 *  security gate on its own. Security-gated readers MUST call
 *  findVerifiedDemoAccount() (lib/demo-cookie) which verifies the signature
 *  first, then additionally check isDemoStaffAccount() AND that demo mode is
 *  on (see requireStaffFor / isStaffForCity). This bare form is only for
 *  resolving the header label + logout persona from an already-trusted name. */
export function findDemoAccount(
  username: string | undefined | null,
): DemoAccount | null {
  if (!username) return null;
  return DEMO_ACCOUNTS.find((a) => a.username === username) ?? null;
}

/** True iff the persona is operational staff (city admin, a team crew, or a
 *  crew-type portal) — the demo analog of a real staff_dispatcher/
 *  staff_supervisor/admin role. Residents (role "user") are NOT staff and
 *  must never pass an operational-access check. Single source of truth for
 *  "which demo personas count as staff". */
export function isDemoStaffAccount(
  account: DemoAccount | null | undefined,
): boolean {
  return (
    account?.role === "admin" ||
    account?.role === "team" ||
    account?.role === "crew"
  );
}
