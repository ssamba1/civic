import "server-only";
import { createServerClient } from "@/lib/db/client";
import { fetchCrewIdsByUser } from "@/lib/db/crews";
import { createLogger } from "@/lib/logger";

const log = createLogger("db-members");

/** One row in the city Members table. All timestamps are ISO 8601 (timestamptz). */
export interface MemberRow {
  id: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  role: "resident" | "staff_dispatcher" | "staff_supervisor" | "admin";
  teamKey: string | null;
  isShared: boolean;
  /** Crews (ids) this member sits on, resolve names via fetchCityCrews. */
  crewIds: string[];
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
  phone: string | null;
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
interface MemberReportRowRaw {
  id: string;
  status: string;
  address: string | null;
  created_at: string;
  // category lives on the 1:1 classifications table, embedded via the report_id
  // FK. PostgREST returns an object when the FK is UNIQUE (it is) but may return
  // an array on other configs, so the extractor tolerates both.
  classifications: { category: string }[] | { category: string } | null;
}
interface MemberEventRowRaw {
  id: string;
  report_id: string | null;
  event_type: string;
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

// Flatten the embedded classifications relation (object, array, or null) to a
// single category string. See MemberReportRowRaw for why both shapes appear.
function embeddedCategory(
  c: MemberReportRowRaw["classifications"],
): string | null {
  if (!c) return null;
  const row = Array.isArray(c) ? c[0] : c;
  return row?.category ?? null;
}

/**
 * Best-effort id → last_sign_in_at map from the Auth admin API. Paginates up to
 * 5 pages of 1000; on any failure returns whatever it collected (callers treat a
 * missing id as null). Never throws. Auth listing is supplementary, not the
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
 * leaking PII. Server-side only. The raw address must not reach the client.
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
 * Mask a phone for demo-grade sessions: "+1 470 555 0142" → "•••••42". Same
 * rationale as maskEmail. Demo credentials are public, so a demo session must
 * never see raw member phone numbers. Keeps the last two digits for recognition
 * ("is this the number I expect?") while hiding the rest behind a fixed mask.
 * Server-side only. The raw number must not reach the client.
 */
export function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  const last2 = digits.slice(-2);
  return `•••••${last2}`;
}

/**
 * Load every member of `cityId` with per-user activity rollups (report count,
 * last report/event time, last sign-in). Service-role client, call only behind
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
      .select(
        "id, display_name, email, phone, role, team_key, is_shared, created_at",
      )
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

    // 4. Last sign-in (best-effort, never throws) + crew memberships
    //    (best-effort, missing user ⇒ no crews).
    const lastSignInById = await fetchLastSignInMap(db);
    const crewIdsByUser = await fetchCrewIdsByUser(cityId);

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
        phone: u.phone,
        role: u.role,
        teamKey: u.team_key,
        isShared: u.is_shared ?? false,
        crewIds: crewIdsByUser.get(u.id) ?? [],
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

// ─────────────────────────────────────────────────────────────────────────────
// Member detail
// ─────────────────────────────────────────────────────────────────────────────

/** One report authored by the member. category is null when unclassified. */
export interface MemberReportItem {
  id: string;
  status: string;
  category: string | null;
  address: string | null;
  createdAt: string;
}
/** One lifecycle event the member is the actor of. `note` is always null.
 *  Report_events has no freetext column (metadata is structured jsonb). */
export interface MemberEventItem {
  id: string;
  reportId: string | null;
  type: string;
  note: string | null;
  createdAt: string;
}
export interface MemberDetail {
  member: MemberRow;
  reports: MemberReportItem[]; // newest first, capped
  events: MemberEventItem[]; // newest first, capped
  statusCounts: Record<string, number>; // over ALL of this member's city reports
}
export type MemberDetailResult =
  | { ok: true; detail: MemberDetail }
  | { ok: false; error: string };

// Detail list caps: statusCounts/reportCount still span the full history, only
// the returned arrays are truncated.
const MEMBER_REPORTS_CAP = 50;
const MEMBER_EVENTS_CAP = 100;

/**
 * Load one member of `cityId` with their report history, lifecycle events, and
 * status rollup. Service-role client, call only behind the page's admin gate.
 * Never throws: a missing/foreign member returns `member_not_found`, a failure
 * on the primary users lookup returns a tagged error, and every rollup (reports,
 * events, last sign-in) degrades to empty/null so the profile still renders,
 * same policy as fetchCityMembers.
 */
export async function fetchMemberDetail(
  cityId: string,
  userId: string,
): Promise<MemberDetailResult> {
  try {
    const db = createServerClient();

    // 1. The member, id AND city_id both enforced, so a user belonging to
    //    another city can never be loaded through this city's console.
    const { data: userRow, error: userErr } = await db
      .from("users")
      .select(
        "id, display_name, email, phone, role, team_key, is_shared, created_at",
      )
      .eq("id", userId)
      .eq("city_id", cityId)
      .maybeSingle();
    if (userErr) {
      log.error("member users query failed", userErr, { cityId, userId });
      return { ok: false, error: "member_query_failed" };
    }
    if (!userRow) return { ok: false, error: "member_not_found" };
    const u = userRow as UserRowRaw;

    // 2. Every report this member filed in this city, newest first. Fetched in
    //    full so statusCounts + reportCount span the whole history; the returned
    //    list is sliced to the cap. category is embedded from the 1:1
    //    classifications table via its report_id FK.
    const statusCounts: Record<string, number> = {};
    let reports: MemberReportItem[] = [];
    let reportCount = 0;
    let lastReportAt: string | null = null;
    const { data: reportData, error: reportErr } = await db
      .from("reports")
      .select("id, status, address, created_at, classifications(category)")
      .eq("reporter_id", userId)
      .eq("city_id", cityId)
      .order("created_at", { ascending: false });
    if (reportErr) {
      // Degrade like fetchCityMembers: log and leave the rollups empty rather
      // than failing the whole profile, the member row already loaded.
      log.error("member reports query failed", reportErr, { cityId, userId });
    } else {
      const reportRows = (reportData ?? []) as MemberReportRowRaw[];
      reportCount = reportRows.length;
      lastReportAt = reportRows[0]?.created_at ?? null; // newest-first
      for (const r of reportRows)
        statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
      reports = reportRows.slice(0, MEMBER_REPORTS_CAP).map((r) => ({
        id: r.id,
        status: r.status,
        category: embeddedCategory(r.classifications),
        address: r.address,
        createdAt: r.created_at,
      }));
    }

    // 3. Lifecycle events this member is the actor of, newest first. Only rows
    //    with actor_id set attribute to a person (report_created → reporter,
    //    classification_overridden → staff); system status-change rows carry no
    //    actor_id and are excluded.
    let events: MemberEventItem[] = [];
    let lastEventAt: string | null = null;
    const { data: eventData, error: eventErr } = await db
      .from("report_events")
      .select("id, report_id, event_type, created_at")
      .eq("actor_id", userId)
      .order("created_at", { ascending: false })
      .limit(MEMBER_EVENTS_CAP);
    if (eventErr) {
      log.error("member report_events query failed", eventErr, {
        cityId,
        userId,
      });
    } else {
      const eventRows = (eventData ?? []) as MemberEventRowRaw[];
      lastEventAt = eventRows[0]?.created_at ?? null; // newest-first
      events = eventRows.map((e) => ({
        id: e.id,
        reportId: e.report_id,
        type: e.event_type,
        note: null,
        createdAt: e.created_at,
      }));
    }

    // 4. Last sign-in. Single Auth lookup, best-effort (never throws).
    let lastSignInAt: string | null = null;
    try {
      const { data: authData, error: authErr } =
        await db.auth.admin.getUserById(userId);
      if (authErr) log.error("getUserById failed", authErr, { userId });
      else lastSignInAt = authData.user?.last_sign_in_at ?? null;
    } catch (err) {
      log.error("getUserById threw", err, { userId });
    }

    // Crew memberships, best-effort map over this city's crews.
    const crewIdsByUser = await fetchCrewIdsByUser(cityId);

    const member: MemberRow = {
      id: u.id,
      displayName: u.display_name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      teamKey: u.team_key,
      isShared: u.is_shared ?? false,
      crewIds: crewIdsByUser.get(u.id) ?? [],
      joinedAt: u.created_at,
      lastSignInAt,
      reportCount,
      lastActiveAt: maxIso(lastReportAt, lastEventAt),
    };

    return { ok: true, detail: { member, reports, events, statusCounts } };
  } catch (err) {
    log.error("fetchMemberDetail threw", err, { cityId, userId });
    return { ok: false, error: "member_query_failed" };
  }
}
