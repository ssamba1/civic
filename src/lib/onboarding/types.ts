import type { ReportCategory } from "@/lib/types";

/* ==================================================================
   Shared data contract for the city onboarding flow.

   Pure types only — imported by the client wizard AND the server
   provisioning action, so this file must stay free of "use client" /
   "use server" directives and runtime-only deps.
   ================================================================== */

/** Roles a provisioned staff account may hold (residents never come from onboarding). */
export type StaffRole = "admin" | "staff_supervisor" | "staff_dispatcher";

/** One account per person (full audit trail) vs one shared login per team. */
export type RosterGranularity = "per_person" | "shared_per_team";

/** How generated credentials reach staff. */
export type CredentialDelivery = "invite" | "temp_password";

/** An enabled team for the new city (a preset, possibly renamed). */
export interface TeamConfigInput {
  teamKey: string; // preset TeamId, e.g. "streets_roads"
  label: string; // per-city display name (may be renamed)
  categories: ReportCategory[]; // categories this team owns in this city
}

/** A single staff member in per-person mode. */
export interface RosterPersonInput {
  name: string;
  email: string;
  role: StaffRole;
  teamKey: string;
}

/** A generated shared login in shared-per-team mode (one per enabled team). */
export interface SharedTeamAccountInput {
  teamKey: string;
  email: string;
}

/** Full payload submitted to the provisioning server action. */
export interface OnboardCityInput {
  city: {
    name: string;
    state: string;
    slug: string;
    center: { lat: number; lng: number } | null;
  };
  teams: TeamConfigInput[];
  granularity: RosterGranularity;
  roster: RosterPersonInput[]; // used when granularity === "per_person"
  sharedAccounts: SharedTeamAccountInput[]; // used when granularity === "shared_per_team"
  delivery: CredentialDelivery;
}

/** Outcome of provisioning one account. */
export interface ProvisionedAccount {
  email: string;
  label: string; // person name or team label
  teamKey: string | null;
  role: StaffRole;
  status: "created" | "invited" | "skipped" | "error";
  /** Present only when delivery === "temp_password" and the account was created. */
  tempPassword?: string;
  /** Human-readable reason for skipped/error. */
  message?: string;
}

/** Result returned by provisionCity. */
export interface ProvisionResult {
  ok: boolean;
  citySlug?: string;
  accounts: ProvisionedAccount[];
  /** Set when provisioning failed before any account work (e.g. slug taken). */
  error?: string;
  /** Non-fatal issues (e.g. routing config failed to save) surfaced to the admin. */
  warnings?: string[];
}

/** One autocomplete result from the onboarding city search (Nominatim-backed). */
export interface CitySuggestion {
  /** Resolved locality name, e.g. "Atlanta". */
  name: string;
  /** Resolved state, normalized to its USPS abbreviation, e.g. "GA". */
  state: string;
  lat: number;
  lng: number;
  /** Full Nominatim display string, shown as the suggestion subtitle. */
  displayName: string;
}

/** Resolved owning-team display for one report category (staff console). */
export interface TeamDisplay {
  teamKey: string;
  label: string;
  color: string;
}

/** category → owning-team display map, consumed by the staff inbox. */
export type CategoryTeamMap = Partial<Record<ReportCategory, TeamDisplay>>;
