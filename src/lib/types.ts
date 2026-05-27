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
}

export type GeoPoint = { lng: number; lat: number };

export function normalizeLocation(raw: unknown): GeoPoint | null {
  if (raw == null) return null;
  // PostGIS GeoJSON: { type: "Point", coordinates: [lng, lat] }
  if (
    typeof raw === "object" &&
    (raw as Record<string, unknown>)["type"] === "Point" &&
    Array.isArray((raw as Record<string, unknown>)["coordinates"])
  ) {
    const coords = (raw as Record<string, unknown>)["coordinates"] as unknown[];
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!isNaN(lng) && !isNaN(lat)) return { lng, lat };
    return null;
  }
  // Plain {lng, lat} object
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const lng = Number(obj["lng"]);
    const lat = Number(obj["lat"]);
    if (!isNaN(lng) && !isNaN(lat)) return { lng, lat };
  }
  // WKT string: "POINT(lng lat)"
  if (typeof raw === "string") {
    const m = raw.match(/^POINT\(\s*([-\d.]+)\s+([-\d.]+)\s*\)$/i);
    if (m) {
      const lng = Number(m[1]);
      const lat = Number(m[2]);
      if (!isNaN(lng) && !isNaN(lat)) return { lng, lat };
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

export interface WorkOrder {
  id: string;
  report_id: string;
  department: Department;
  crew_type: CrewType | null;
  priority_score: number;
  est_minutes: number | null;
  materials: string[] | null;
  assigned_crew_id: string | null;
  dispatched_at: string | null;
  completed_at: string | null;
  resolution_photo_url: string | null;
  resolution_ai_score: number | null;
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
