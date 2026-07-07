import "server-only";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("db-members");

/** One row in the city Members table. All timestamps are ISO 8601 (timestamptz). */
export interface MemberRow {
  id: string;
  displayName: string | null;
  email: string | null;
  role: "resident" | "staff_dispatcher" | "staff_supervisor" | "admin";
  teamKey: string | null;
  isShared: boolean;
  joinedAt: string;
  lastSignInAt: string | null;
  reportCount: number;
  lastActiveAt: string | null;
}

// PostgREST rows come back untyped from the schema-less service client; these
// shapes are the columns each query selects, cast at the boundary so the rest
// of the module is fully typed.
interface UserRowRaw {
  id: string;
  display_name: string | null;
  email: string | null;
  role: MemberRow["role"];
  team_key: string | null;
  is_shared: boolean | null;
  created_at: string;
}
interface ReportRowRaw {
  reporter_id: string | null;
  created_at: string;
}
interface EventRowRaw {
  actor_id: string | null;
  created_at: string;
}

// Admin → staff → resident, so operators sort to the top of the roster.
const ROLE_RANK: Record<MemberRow["role"], number> = {
  admin: 0,
  staff_supervisor: 1,
  staff_dispatcher: 2,
  resident: 3,
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

// ISO 8601 strings sort lexicographically in chronological order, so a plain
// string compare yields the later timestamp without parsing to Date.
function maxIso(a: string | null, b: string | null): string | null {
  if (a && b) return a > b ? a : b;
  return a ?? b ?? null;
}

/**
 * Best-effort id → last_sign_in_at map from the Auth admin API. Paginates up to
 * 5 pages of 1000; on any failure returns whatever it collected (callers treat a
 * missing id as null). Never throws — auth listing is supplementary, not the
 * source of truth for the roster.
 */
async function fetchLastSignInMap(
  db: ReturnType<typeof createServerClient>,
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  try {
    const perPage = 1000;
    for (let page = 1; page <= 5; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage });
      if (error) {
        log.error("listUsers page failed", error, { page });
        break;
      }
      const users = data?.users ?? [];
      for (const u of users) map.set(u.id, u.last_sign_in_at ?? null);
      if (users.length < perPage) break;
    }
  } catch (err) {
    log.error("listUsers threw", err);
  }
  return map;
}

export type CityMembersResult =
  | { ok: true; members: MemberRow[] }
  | { ok: false; error: string };

/**
 * Mask an email for demo-grade sessions: "jane.doe@city.gov" → "j•••@c•••.gov".
 * Demo credentials are public (baked into the bundle), so a demo session must
 * never see raw member emails; masking keeps the table demoable without
 * leaking PII. Server-side only — the raw address must not reach the client.
 */
export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0) return "•••";
  const domain = email.slice(at + 1);
  const lastDot = domain.lastIndexOf(".");
  const host = lastDot > 0 ? domain.slice(0, lastDot) : domain;
  const tld = lastDot > 0 ? domain.slice(lastDot) : "";
  return `${email[0]}•••@${host[0] ?? ""}•••${tld}`;
}

/**
 * Load every member of `cityId` with per-user activity rollups (report count,
 * last report/event time, last sign-in). Service-role client — call only behind
 * the page's staff-access gate. Never throws: a failure on the primary users
 * query returns a tagged error (every real city has at least its admin, so an
 * empty-looking roster must not masquerade as success); secondary rollups
 * degrade to zero/null so the roster still renders.
 */
export async function fetchCityMembers(
  cityId: string,
): Promise<CityMembersResult> {
  try {
    const db = createServerClient();

    // 1. Everyone in this city.
    const { data: userData, error: userErr } = await db
      .from("users")
      .select("id, display_name, email, role, team_key, is_shared, created_at")
      .eq("city_id", cityId);
    if (userErr) {
      log.error("users query failed", userErr, { cityId });
      return { ok: false, error: "members_query_failed" };
    }
    const users = (userData ?? []) as UserRowRaw[];
    if (users.length === 0) return { ok: true, members: [] };

    const ids = users.map((u) => u.id);

    // 2. Reports for this city → per-reporter count + latest created_at.
    const reportStats = new Map<string, { count: number; last: string }>();
    const { data: reportData, error: reportErr } = await db
      .from("reports")
      .select("reporter_id, created_at")
      .eq("city_id", cityId);
    if (reportErr) {
      log.error("reports query failed", reportErr, { cityId });
    } else {
      for (const r of (reportData ?? []) as ReportRowRaw[]) {
        if (!r.reporter_id) continue;
        const cur = reportStats.get(r.reporter_id);
        if (cur) {
          cur.count += 1;
          if (r.created_at > cur.last) cur.last = r.created_at;
        } else {
          reportStats.set(r.reporter_id, { count: 1, last: r.created_at });
        }
      }
    }

    // 3. report_events → latest created_at per actor. Chunk the id list so the
    //    .in() filter never overruns PostgREST's URL length.
    const lastEventByActor = new Map<string, string>();
    for (const idChunk of chunk(ids, 100)) {
      const { data: eventData, error: eventErr } = await db
        .from("report_events")
        .select("actor_id, created_at")
        .in("actor_id", idChunk);
      if (eventErr) {
        log.error("report_events query failed", eventErr, { cityId });
        continue;
      }
      for (const e of (eventData ?? []) as EventRowRaw[]) {
        if (!e.actor_id) continue;
        const cur = lastEventByActor.get(e.actor_id);
        if (!cur || e.created_at > cur)
          lastEventByActor.set(e.actor_id, e.created_at);
      }
    }

    // 4. Last sign-in (best-effort, never throws).
    const lastSignInById = await fetchLastSignInMap(db);

    // 5. Assemble + sort (role rank, then display name).
    const rows: MemberRow[] = users.map((u) => {
      const reports = reportStats.get(u.id);
      const lastActiveAt = maxIso(
        reports?.last ?? null,
        lastEventByActor.get(u.id) ?? null,
      );
      return {
        id: u.id,
        displayName: u.display_name,
        email: u.email,
        role: u.role,
        teamKey: u.team_key,
        isShared: u.is_shared ?? false,
        joinedAt: u.created_at,
        lastSignInAt: lastSignInById.get(u.id) ?? null,
        reportCount: reports?.count ?? 0,
        lastActiveAt,
      };
    });

    rows.sort((a, b) => {
      const byRole = ROLE_RANK[a.role] - ROLE_RANK[b.role];
      if (byRole !== 0) return byRole;
      return (a.displayName ?? "").localeCompare(b.displayName ?? "");
    });

    return { ok: true, members: rows };
  } catch (err) {
    log.error("fetchCityMembers threw", err, { cityId });
    return { ok: false, error: "members_query_failed" };
  }
}
