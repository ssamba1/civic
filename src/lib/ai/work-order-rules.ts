import type {
  Classification,
  ReportCategory,
  Department,
  CrewType,
} from "@/lib/types";

interface WorkOrderRule {
  department: Department;
  crew_type: CrewType | null;
  est_minutes: number;
  materials: string[];
}

const RULES: Record<ReportCategory, WorkOrderRule> = {
  pothole: {
    department: "public_works",
    crew_type: "paving",
    est_minutes: 30,
    materials: ["cold patch", "tamper"],
  },
  streetlight: {
    department: "utilities",
    crew_type: "line_crew",
    est_minutes: 60,
    materials: ["bulb", "fuse", "lift truck"],
  },
  downed_sign: {
    department: "public_works",
    crew_type: "sign_crew",
    est_minutes: 20,
    materials: ["post", "bolts"],
  },
  graffiti: {
    department: "parks",
    crew_type: "cleanup",
    est_minutes: 40,
    materials: ["solvent", "pressure washer"],
  },
  illegal_dump: {
    department: "sanitation",
    crew_type: "cleanup",
    est_minutes: 45,
    materials: ["truck", "gloves"],
  },
  water_leak: {
    department: "utilities",
    crew_type: "line_crew",
    est_minutes: 120,
    materials: ["varies by severity"],
  },
  sidewalk_damage: {
    department: "public_works",
    crew_type: "concrete",
    est_minutes: 240,
    materials: ["concrete mix", "forms"],
  },
  tree_down: {
    department: "parks",
    crew_type: "arborist",
    est_minutes: 90,
    materials: ["chainsaw", "chipper"],
  },
  debris: {
    department: "sanitation",
    crew_type: "cleanup",
    est_minutes: 20,
    materials: ["truck"],
  },
  drainage: {
    department: "public_works",
    crew_type: "drain_crew",
    est_minutes: 90,
    materials: ["jet truck"],
  },
  faded_signage: {
    department: "public_works",
    crew_type: "sign_crew",
    est_minutes: 25,
    materials: ["replacement sign"],
  },
  other: {
    department: "other",
    crew_type: null,
    est_minutes: 0,
    materials: [],
  },
};

interface ReportMeta {
  isSchoolZone: boolean;
  footTrafficWeight: number;
  recurrenceCount: number;
}

interface GeneratedWorkOrder {
  department: Department;
  crew_type: CrewType | null;
  priority_score: number;
  est_minutes: number;
  materials: string[];
}

/**
 * Deterministic work order from classification + report context.
 *
 * priority = (severity * 2)
 *          + (foot_traffic_weight * 1.5)
 *          + (school_zone_bonus * 3)    — 1 if school zone, else 0
 *          + (recurrence_bonus * 1)     — raw recurrence count
 *          + (emergency_override * 50)  — 1 if is_emergency, else 0
 */
export function generateWorkOrder(
  classification: Classification,
  meta: ReportMeta
): GeneratedWorkOrder {
  const rule = RULES[classification.category];

  const schoolZoneBonus = meta.isSchoolZone ? 1 : 0;
  const emergencyOverride = classification.is_emergency ? 1 : 0;

  const priority_score =
    classification.severity * 2 +
    meta.footTrafficWeight * 1.5 +
    schoolZoneBonus * 3 +
    meta.recurrenceCount * 1 +
    emergencyOverride * 50;

  return {
    department: rule.department,
    crew_type: rule.crew_type,
    priority_score: Math.round(priority_score * 100) / 100,
    est_minutes: rule.est_minutes,
    materials: rule.materials,
  };
}
