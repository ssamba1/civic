export type Result<T, E = string> =
  | { ok: true; data: T }
  | { ok: false; error: E };

export type ReportStatus =
  | "open"
  | "dispatched"
  | "in_progress"
  | "closed"
  | "merged"
  | "rejected";

export type UserRole =
  | "resident"
  | "staff_dispatcher"
  | "staff_supervisor"
  | "admin";

export type ReportCategory =
  | "pothole"
  | "streetlight"
  | "downed_sign"
  | "graffiti"
  | "illegal_dump"
  | "water_leak"
  | "sidewalk_damage"
  | "tree_down"
  | "debris"
  | "drainage"
  | "faded_signage"
  | "other";

export type Department =
  | "public_works"
  | "utilities"
  | "parks"
  | "code_enforcement"
  | "sanitation"
  | "other";

export type CrewType =
  | "paving"
  | "line_crew"
  | "sign_crew"
  | "cleanup"
  | "concrete"
  | "arborist"
  | "drain_crew";

export interface Classification {
  category: ReportCategory;
  subcategory: string;
  severity: 1 | 2 | 3 | 4 | 5;
  hazard_radius_m: number;
  visible_size_estimate: string;
  is_emergency: boolean;
  confidence: number;
  reasoning: string;
  /** True when the AI saw no actual infrastructure damage/hazard in the photo. */
  no_issue_detected: boolean;
  /** Other categories the AI thought could also plausibly apply; empty when confident. */
  alternate_categories: ReportCategory[];
}

export type GeoPoint = { lng: number; lat: number };

export function normalizeLocation(raw: unknown): GeoPoint | null {
  if (raw == null) return null;
  // PostGIS GeoJSON: { type: "Point", coordinates: [lng, lat] }
  if (
    typeof raw === "object" &&
    (raw as Record<string, unknown>).type === "Point" &&
    Array.isArray((raw as Record<string, unknown>).coordinates)
  ) {
    const coords = (raw as Record<string, unknown>).coordinates as unknown[];
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isNaN(lng) && !Number.isNaN(lat)) return { lng, lat };
    return null;
  }
  // Plain {lng, lat} object
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const lng = Number(obj.lng);
    const lat = Number(obj.lat);
    if (!Number.isNaN(lng) && !Number.isNaN(lat)) return { lng, lat };
  }
  // WKT string: "POINT(lng lat)"
  if (typeof raw === "string") {
    const m = raw.match(/^POINT\(\s*([-\d.]+)\s+([-\d.]+)\s*\)$/i);
    if (m) {
      const lng = Number(m[1]);
      const lat = Number(m[2]);
      if (!Number.isNaN(lng) && !Number.isNaN(lat)) return { lng, lat };
    }
    // Hex EWKB (what PostgREST returns for geography columns), e.g.
    // "0101000020E6100000...": byte-order, geom type (+SRID flag), [SRID], X, Y.
    if (/^[0-9A-Fa-f]+$/.test(raw) && raw.length >= 42) {
      const bytes = new Uint8Array(raw.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
      }
      const view = new DataView(bytes.buffer);
      const little = bytes[0] === 1;
      const type = view.getUint32(1, little);
      if ((type & 0xff) === 1) {
        // Point. Coords start after type, plus 4 bytes if the SRID flag is set.
        const offset = (type & 0x20000000) !== 0 ? 9 : 5;
        if (bytes.length >= offset + 16) {
          const lng = view.getFloat64(offset, little);
          const lat = view.getFloat64(offset + 8, little);
          if (!Number.isNaN(lng) && !Number.isNaN(lat)) return { lng, lat };
        }
      }
    }
  }
  return null;
}

export interface Report {
  id: string;
  city_id: string;
  reporter_id: string;
  location: GeoPoint;
  photo_public_url: string;
  photo_raw_url: string | null;
  status: ReportStatus;
  address: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export type WorkOrderSource = "ai" | "rules";

export interface WorkOrder {
  id: string;
  report_id: string;
  department: Department;
  /** Crew-type key. Usually one of the CrewType defaults, but cities define
   *  their own catalog (crew_types, migration 031) — so plain string. */
  crew_type: string | null;
  priority_score: number;
  est_minutes: number | null;
  materials: string[] | null;
  est_cost: number | null;
  wo_source: WorkOrderSource | null;
  wo_rationale: string | null;
  assigned_crew_id: string | null;
  dispatched_at: string | null;
  completed_at: string | null;
  resolution_photo_url: string | null;
  resolution_ai_score: number | null;
  fix_cost_estimate: number | null;
  fix_time_estimate_days: number | null;
  fix_note: string | null;
  marked_under_fix_at: string | null;
  /** True when the report was queued for human review instead of auto-dispatched. */
  needs_manual_review: boolean;
  /** Human-readable reason(s) the AI flagged this report, joined with "; ". Null when not flagged. */
  review_reason: string | null;
  /** Actual cost spent (whole dollars) entered by the worker at job close. Null until reported. */
  actual_cost: number | null;
  /** True when actual_cost exceeded 5× the category running median at capture — excluded from training, pending supervisor review. */
  actual_cost_excluded: boolean;
  /** SLA deadline stamped at creation (created_at + category SLA hours). Null on un-migrated DBs or cities without sla_targets — read paths fall back to the static CATEGORY_SLA_TARGETS map. (migration 032) */
  due_at: string | null;
  /** Set once when the overdue-escalation job first acts on this breached, still-open work order. Keeps escalation idempotent. (migration 032) */
  escalated_at: string | null;
}

/** One row from category_cost_stats(_city_id) RPC. */
export interface CategoryCostStats {
  category: string;
  base: number;
  avg_severity: number;
  stddev: number;
  n: number;
  reliability: number;
  tier: "low" | "medium" | "high";
}

export interface City {
  id: string;
  slug: string;
  name: string;
  state: string;
  boundary: unknown;
  open311_jurisdiction_id: string | null;
  active: boolean;
}

export interface User {
  id: string;
  city_id: string;
  role: UserRole;
  email: string | null;
  display_name: string;
  created_at: string;
}

export interface WorkOrderWithDetails {
  id: string;
  report_id: string;
  department: string;
  crew_type: string | null;
  priority_score: number;
  est_minutes: number;
  materials: string[];
  est_cost: number | null;
  wo_source: string | null;
  wo_rationale: string | null;
  assigned_crew_id: string | null;
  dispatched_at: string | null;
  completed_at: string | null;
  resolution_photo_url: string | null;
  resolution_ai_score: number | null;
  fix_cost_estimate: number | null;
  fix_time_estimate_days: number | null;
  fix_note: string | null;
  marked_under_fix_at: string | null;
  needs_manual_review: boolean;
  review_reason: string | null;
  report: {
    id: string;
    city_id: string;
    reporter_id: string;
    location: { lng: number; lat: number };
    photo_public_url: string;
    photo_raw_url: string | null;
    status: string;
    address: string | null;
    description: string | null;
    created_at: string;
    updated_at: string;
  };
  classification: {
    category: string;
    subcategory: string;
    severity: number;
    hazard_radius_m: number;
    visible_size_estimate: string;
    is_emergency: boolean;
    confidence: number;
    reasoning: string;
    no_issue_detected?: boolean;
    alternate_categories?: string[];
  } | null;
}
