import "server-only";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("db-crews");

/** One person on a crew. displayName is the users row value (may be null). */
export interface CrewMemberInfo {
  userId: string;
  displayName: string | null;
  isLead: boolean;
}

/** One crew (sub-team unit inside a division). Members are embedded — city
 *  crews are small (a handful per division), so the roster always travels
 *  with the crew instead of a second fetch. */
export interface CrewRow {
  id: string;
  teamKey: string;
  name: string;
  crewType: string | null;
  description: string;
  active: boolean;
  members: CrewMemberInfo[];
}

export type CityCrewsResult =
  | { ok: true; crews: CrewRow[] }
  | { ok: false; error: string };

interface CrewRowRaw {
  id: string;
  team_key: string;
  name: string;
  crew_type: string | null;
  // Pre-032 DBs don't have this column yet — PostgREST simply omits the key.
  description?: string;
  active: boolean;
}
interface CrewMemberRowRaw {
  crew_id: string;
  user_id: string;
  is_lead: boolean;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

/**
 * Load every crew of `cityId` with its member roster. Service-role client —
 * call only behind a staff-access gate (crew rosters name staff, so unlike
 * city_teams this data is never public). Never throws: a failure on the
 * primary crews query returns a tagged error; membership/display-name lookups
 * degrade to empty so the crew list still renders.
 */
export async function fetchCityCrews(cityId: string): Promise<CityCrewsResult> {
  try {
    const db = createServerClient();

    const { data: crewData, error: crewErr } = await db
      .from("crews")
      .select("id, team_key, name, crew_type, description, active")
      .eq("city_id", cityId)
      .order("team_key")
      .order("name");
    if (crewErr) {
      log.error("crews query failed", crewErr, { cityId });
      return { ok: false, error: "crews_query_failed" };
    }
    const crews = (crewData ?? []) as CrewRowRaw[];
    if (crews.length === 0) return { ok: true, crews: [] };

    // Memberships for all crews at once; chunk the .in() so the filter never
    // overruns PostgREST's URL length (same policy as db/members.ts).
    const memberships: CrewMemberRowRaw[] = [];
    for (const idChunk of chunk(
      crews.map((c) => c.id),
      100,
    )) {
      const { data, error } = await db
        .from("crew_members")
        .select("crew_id, user_id, is_lead")
        .in("crew_id", idChunk);
      if (error) {
        log.error("crew_members query failed", error, { cityId });
        continue;
      }
      memberships.push(...((data ?? []) as CrewMemberRowRaw[]));
    }

    // Display names for everyone that appears on any crew.
    const nameById = new Map<string, string | null>();
    const userIds = [...new Set(memberships.map((m) => m.user_id))];
    for (const idChunk of chunk(userIds, 100)) {
      const { data, error } = await db
        .from("users")
        .select("id, display_name")
        .in("id", idChunk);
      if (error) {
        log.error("crew member names query failed", error, { cityId });
        continue;
      }
      for (const u of (data ?? []) as {
        id: string;
        display_name: string | null;
      }[])
        nameById.set(u.id, u.display_name);
    }

    const membersByCrew = new Map<string, CrewMemberInfo[]>();
    for (const m of memberships) {
      const list = membersByCrew.get(m.crew_id) ?? [];
      list.push({
        userId: m.user_id,
        displayName: nameById.get(m.user_id) ?? null,
        isLead: m.is_lead,
      });
      membersByCrew.set(m.crew_id, list);
    }
    // Leads first, then alphabetical — matches how a roster is read.
    for (const list of membersByCrew.values()) {
      list.sort((a, b) => {
        if (a.isLead !== b.isLead) return a.isLead ? -1 : 1;
        return (a.displayName ?? "").localeCompare(b.displayName ?? "");
      });
    }

    return {
      ok: true,
      crews: crews.map((c) => ({
        id: c.id,
        teamKey: c.team_key,
        name: c.name,
        crewType: c.crew_type,
        description: c.description ?? "",
        active: c.active,
        members: membersByCrew.get(c.id) ?? [],
      })),
    };
  } catch (err) {
    log.error("fetchCityCrews threw", err, { cityId });
    return { ok: false, error: "crews_query_failed" };
  }
}

/**
 * Map of userId → crew ids they belong to, across all crews of `cityId`.
 * Best-effort: any failure returns what was collected (callers treat a missing
 * user as "no crews") — crew membership is supplementary roster data, never
 * the source of truth for access.
 */
export async function fetchCrewIdsByUser(
  cityId: string,
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  try {
    const db = createServerClient();
    const { data: crewData, error: crewErr } = await db
      .from("crews")
      .select("id")
      .eq("city_id", cityId);
    if (crewErr) {
      log.error("crew ids query failed", crewErr, { cityId });
      return map;
    }
    const crewIds = ((crewData ?? []) as { id: string }[]).map((c) => c.id);
    if (crewIds.length === 0) return map;

    for (const idChunk of chunk(crewIds, 100)) {
      const { data, error } = await db
        .from("crew_members")
        .select("crew_id, user_id")
        .in("crew_id", idChunk);
      if (error) {
        log.error("crew membership map query failed", error, { cityId });
        continue;
      }
      for (const m of (data ?? []) as { crew_id: string; user_id: string }[]) {
        const list = map.get(m.user_id) ?? [];
        list.push(m.crew_id);
        map.set(m.user_id, list);
      }
    }
  } catch (err) {
    log.error("fetchCrewIdsByUser threw", err, { cityId });
  }
  return map;
}
