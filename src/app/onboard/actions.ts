"use server";

import { randomBytes } from "node:crypto";
import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";
import { slugify } from "@/lib/onboarding/presets";
import type {
  CitySuggestion,
  OnboardCityInput,
  ProvisionedAccount,
  ProvisionResult,
  StaffRole,
} from "@/lib/onboarding/types";

const logger = createLogger("[onboard]");

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const SLUG_RE = /^[a-z0-9-]+$/;

// Nominatim returns full state names ("Georgia"); ship-with cities store USPS
// abbreviations ("GA"). Normalize on ingest so every city — onboarded or
// shipped — displays consistently (e.g. "Atlanta, GA", not "Atlanta, Georgia").
const US_STATE_ABBR: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "puerto rico": "PR",
  guam: "GU",
  "u.s. virgin islands": "VI",
  "united states virgin islands": "VI",
  "american samoa": "AS",
  "northern mariana islands": "MP",
};

/** Map a Nominatim state string to its USPS abbreviation; pass through if unknown. */
function toStateAbbr(state: string): string {
  return US_STATE_ABBR[state.trim().toLowerCase()] ?? state.trim();
}

function genPassword(): string {
  // base64url is URL-safe and contains no ambiguous quoting chars.
  return randomBytes(12).toString("base64url");
}

/**
 * Search US localities by free-text query via OpenStreetMap Nominatim and
 * return up to 6 ranked suggestions. Each suggestion carries its own center
 * point, so the onboarding wizard sets the map center directly from the
 * selection and never needs a second geocode round-trip.
 *
 * Free, no API key. Returns [] on any failure — search is best-effort and
 * never blocks onboarding. The client debounces keystrokes and drops stale
 * responses, which cuts per-client volume; note that OSM's public endpoint
 * rate-limits autocomplete (≤1 req/s aggregate, single egress IP here), so a
 * dedicated geocoder or self-hosted Nominatim is the right move at real scale.
 */
export async function searchCities(query: string): Promise<CitySuggestion[]> {
  const q = query.trim();
  // Below 3 chars the result set is too broad to be a useful locality match.
  if (q.length < 3) return [];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=us&q=${encodeURIComponent(q)}`,
      {
        headers: {
          // Nominatim requires an identifying User-Agent.
          "User-Agent":
            "civic-app/1.0 (+https://civic-social-impact.vercel.app)",
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
      address?: Record<string, string | undefined>;
    }>;
    if (!Array.isArray(data)) return [];

    const seen = new Set<string>();
    const out: CitySuggestion[] = [];
    for (const row of data) {
      const a = row.address ?? {};
      // Prefer the most specific locality type, fall back to county.
      const name =
        a.city ?? a.town ?? a.village ?? a.municipality ?? a.hamlet ?? a.county;
      const state = a.state;
      const lat = Number(row.lat);
      const lng = Number(row.lon);
      // Skip rows with no resolvable locality/state or invalid coordinates,
      // rather than surfacing a raw display_name the wizard can't structure.
      if (!name || !state || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        continue;
      }
      const abbr = toStateAbbr(state);
      const key = `${name.toLowerCase()}|${abbr.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        name,
        state: abbr,
        lat,
        lng,
        displayName: String(row.display_name ?? `${name}, ${abbr}`),
      });
    }
    return out;
  } catch (err) {
    logger.error("city search failed", err);
    return [];
  }
}

interface AccountWork {
  email: string;
  label: string;
  role: StaffRole;
  teamKey: string | null;
}

/**
 * Provision a new city: insert the city + its team config, elevate the
 * authenticated creator to its admin, and create staff accounts.
 *
 * All writes use the service-role client (RLS-bypassing) and only run
 * after the session is verified. Account creation is per-row best-effort:
 * a failure on one account is reported and never aborts the others.
 */
export async function provisionCity(
  input: OnboardCityInput,
): Promise<ProvisionResult> {
  // 1. Auth — must be a signed-in user (becomes the city admin).
  const authUser = await getAuthUser();
  if (!authUser) {
    return {
      ok: false,
      accounts: [],
      error: "You must be signed in to set up a city.",
    };
  }

  // 2. Validate the city.
  const name = input.city.name?.trim();
  const state = input.city.state?.trim();
  let slug = (input.city.slug || "").trim().toLowerCase();
  if (!name || !state) {
    return {
      ok: false,
      accounts: [],
      error: "City name and state are required.",
    };
  }
  if (!slug) slug = slugify(name);
  if (!SLUG_RE.test(slug)) {
    return {
      ok: false,
      accounts: [],
      error:
        "City URL can only contain lowercase letters, numbers, and dashes.",
    };
  }
  if (input.teams.length === 0) {
    return { ok: false, accounts: [], error: "Enable at least one team." };
  }

  const db = createServerClient();

  // 2b. Guard: existing staff/admin must not silently lose their city by
  //     onboarding a new one (one user = one city). Residents may upgrade.
  const { data: existingUser } = await db
    .from("users")
    .select("role, city_id, display_name")
    .eq("id", authUser.id)
    .maybeSingle();
  if (
    existingUser?.city_id &&
    ["staff_dispatcher", "staff_supervisor", "admin"].includes(
      existingUser.role,
    )
  ) {
    return {
      ok: false,
      accounts: [],
      error:
        "Your account is already staff of a city. Use a different account to onboard a new city.",
    };
  }

  // 2c. Abuse guard: self-serve provisioning is capped per account so a single
  //     signup can't mass-create tenants (each city seeds config rows + staff
  //     invites). Operators needing more go through /admin/onboard.
  const MAX_CITIES_PER_ACCOUNT = 3;
  const { count: createdCount } = await db
    .from("cities")
    .select("id", { count: "exact", head: true })
    .eq("created_by", authUser.id);
  if ((createdCount ?? 0) >= MAX_CITIES_PER_ACCOUNT) {
    return {
      ok: false,
      accounts: [],
      error:
        "This account has reached its city limit. Contact us to onboard more cities.",
    };
  }

  // 3. Slug uniqueness (the city's public URL must be unique).
  const { data: existing } = await db
    .from("cities")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      accounts: [],
      error: `The address "/city/${slug}" is already taken. Pick a different city name or slug.`,
    };
  }

  // 4. Insert the city as inactive first — flipped to active only once admin
  //    access is in place, so a failed setup never leaves a live, admin-less
  //    city at /city/[slug]. Unlisted either way (not in the public showcase).
  const center = input.city.center;
  const cityInsert: Record<string, unknown> = {
    slug,
    name,
    state,
    active: false,
  };
  if (center) {
    cityInsert.center = `SRID=4326;POINT(${center.lng} ${center.lat})`;
  }
  const { data: city, error: cityErr } = await db
    .from("cities")
    .insert(cityInsert)
    .select("id, slug")
    .single();
  if (cityErr || !city) {
    logger.error("city insert failed", cityErr);
    return {
      ok: false,
      accounts: [],
      error: "Could not create the city. Please try again.",
    };
  }

  // 5. Elevate the creator to admin of the new city (city-first FK order).
  //    Upsert by id: a fresh signup has no users row; an existing user is
  //    re-pointed to this city (one user = one city — see spec non-goals).
  const adminEmail = authUser.email ?? null;
  const { error: adminErr } = await db.from("users").upsert(
    {
      id: authUser.id,
      city_id: city.id,
      role: "admin",
      email: adminEmail?.toLowerCase() ?? null,
      display_name:
        existingUser?.display_name ?? adminEmail?.split("@")[0] ?? "City Admin",
    },
    { onConflict: "id" },
  );
  if (adminErr) {
    logger.error("admin row upsert failed", adminErr);
    // Compensate: delete the just-created city so the slug is freed and no
    // admin-less city is left behind. Nothing else has been written yet.
    await db.from("cities").delete().eq("id", city.id);
    return {
      ok: false,
      accounts: [],
      error:
        "The city could not be set up (admin access failed). Nothing was saved — please try again.",
    };
  }

  // Mirror the role into auth app_metadata so future proxy/JWT-level guards
  // (e.g. an /admin matcher) see it without a DB read. Best-effort: the
  // public.users row above is the source of truth for RLS.
  try {
    await db.auth.admin.updateUserById(authUser.id, {
      app_metadata: { role: "admin" },
    });
  } catch (err) {
    logger.error("app_metadata role sync failed", err);
  }

  const warnings: string[] = [];

  // Activate + record the creator now that admin access exists.
  const { error: activateErr } = await db
    .from("cities")
    .update({ active: true, created_by: authUser.id })
    .eq("id", city.id);
  if (activateErr) {
    logger.error("city activate failed", activateErr);
    warnings.push("City created but its active flag could not be set.");
  }

  // 6. Per-city team config (enabled presets + labels + category ownership).
  const teamRows = input.teams.map((t) => ({
    city_id: city.id,
    team_key: t.teamKey,
    label: t.label,
    enabled: true,
    categories: t.categories,
  }));
  const { error: teamsErr } = await db
    .from("city_teams")
    .upsert(teamRows, { onConflict: "city_id,team_key" });
  if (teamsErr) {
    logger.error("city_teams insert failed", teamsErr);
    warnings.push(
      "Custom routing couldn't be saved — reports will use default routing. You can reconfigure it from your console.",
    );
  }

  // 7. Build the account work list from the chosen granularity.
  const work: AccountWork[] =
    input.granularity === "shared_per_team"
      ? input.sharedAccounts.map((s) => {
          const team = input.teams.find((t) => t.teamKey === s.teamKey);
          return {
            email: s.email,
            label: team?.label ?? s.teamKey,
            role: "staff_supervisor" as StaffRole,
            teamKey: s.teamKey,
          };
        })
      : input.roster.map((p) => ({
          email: p.email,
          label: p.name?.trim() || p.email,
          role: p.role,
          teamKey: p.teamKey,
        }));

  // 8. Provision each account — best-effort, deduped, never aborts the batch.
  const accounts: ProvisionedAccount[] = [];
  const seen = new Set<string>();
  if (adminEmail) seen.add(adminEmail.toLowerCase()); // never re-create the admin

  for (const w of work) {
    const email = (w.email || "").trim();
    const key = email.toLowerCase();
    const base = { email, label: w.label, teamKey: w.teamKey, role: w.role };

    if (!EMAIL_RE.test(email)) {
      accounts.push({
        ...base,
        status: "error",
        message: "Invalid email address.",
      });
      continue;
    }
    if (seen.has(key)) {
      accounts.push({
        ...base,
        status: "skipped",
        message: "Duplicate email (or the admin's own) — skipped.",
      });
      continue;
    }
    seen.add(key);

    try {
      let userId: string | null;
      let status: ProvisionedAccount["status"];
      let tempPassword: string | undefined;

      if (input.delivery === "invite") {
        const { data, error } = await db.auth.admin.inviteUserByEmail(email);
        if (error) {
          accounts.push({ ...base, status: "error", message: error.message });
          continue;
        }
        userId = data.user?.id ?? null;
        status = "invited";
      } else {
        tempPassword = genPassword();
        const { data, error } = await db.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
        });
        if (error) {
          accounts.push({ ...base, status: "error", message: error.message });
          continue;
        }
        userId = data.user?.id ?? null;
        status = "created";
      }

      if (!userId) {
        accounts.push({
          ...base,
          status: "error",
          message: "Auth account created but no user id was returned.",
        });
        continue;
      }

      const { error: rowErr } = await db.from("users").upsert(
        {
          id: userId,
          city_id: city.id,
          role: w.role,
          email: key, // normalized (lowercase) — matches the dedup key
          display_name: w.label,
          team_key: w.teamKey,
          is_shared: input.granularity === "shared_per_team",
        },
        { onConflict: "id" },
      );
      if (rowErr) {
        // Compensate: delete the orphaned auth user so the email is freed and
        // the row can be re-provisioned (otherwise it's a poison-pill retry).
        await db.auth.admin.deleteUser(userId);
        accounts.push({
          ...base,
          status: "error",
          message: `Could not set up the profile (account rolled back): ${rowErr.message}`,
        });
        continue;
      }

      accounts.push({ ...base, status, tempPassword });
    } catch (err) {
      logger.error("account provisioning threw", err);
      accounts.push({
        ...base,
        status: "error",
        message: err instanceof Error ? err.message : "Unknown error.",
      });
    }
  }

  return { ok: true, citySlug: city.slug, accounts, warnings };
}
