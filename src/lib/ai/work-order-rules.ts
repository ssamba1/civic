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
  /** Flat materials/equipment cost in USD for a typical repair of this category. */
  material_cost: number;
}

/**
 * Blended crew labor rate in USD per hour (loaded — wage + equipment + overhead).
 * Deliberately a single small-city average; the AI generator refines per-report.
 */
const LABOR_RATE_PER_HOUR = 75;

const RULES: Record<ReportCategory, WorkOrderRule> = {
  pothole: {
    department: "public_works",
    crew_type: "paving",
    est_minutes: 30,
    materials: ["cold patch", "tamper"],
    material_cost: 60,
  },
  streetlight: {
    department: "utilities",
    crew_type: "line_crew",
    est_minutes: 60,
    materials: ["bulb", "fuse", "lift truck"],
    material_cost: 120,
  },
  downed_sign: {
    department: "public_works",
    crew_type: "sign_crew",
    est_minutes: 20,
    materials: ["post", "bolts"],
    material_cost: 45,
  },
  graffiti: {
    department: "parks",
    crew_type: "cleanup",
    est_minutes: 40,
    materials: ["solvent", "pressure washer"],
    material_cost: 35,
  },
  illegal_dump: {
    department: "sanitation",
    crew_type: "cleanup",
    est_minutes: 45,
    materials: ["truck", "gloves"],
    material_cost: 80,
  },
  water_leak: {
    department: "utilities",
    crew_type: "line_crew",
    est_minutes: 120,
    materials: ["varies by severity"],
    material_cost: 400,
  },
  sidewalk_damage: {
    department: "public_works",
    crew_type: "concrete",
    est_minutes: 240,
    materials: ["concrete mix", "forms"],
    material_cost: 250,
  },
  tree_down: {
    department: "parks",
    crew_type: "arborist",
    est_minutes: 90,
    materials: ["chainsaw", "chipper"],
    material_cost: 150,
  },
  debris: {
    department: "sanitation",
    crew_type: "cleanup",
    est_minutes: 20,
    materials: ["truck"],
    material_cost: 30,
  },
  drainage: {
    department: "public_works",
    crew_type: "drain_crew",
    est_minutes: 90,
    materials: ["jet truck"],
    material_cost: 200,
  },
  faded_signage: {
    department: "public_works",
    crew_type: "sign_crew",
    est_minutes: 25,
    materials: ["replacement sign"],
    material_cost: 90,
  },
  other: {
    department: "other",
    crew_type: null,
    est_minutes: 0,
    materials: [],
    material_cost: 0,
  },
};

/**
 * Deterministic repair cost floor in whole USD:
 *   labor_rate * (minutes / 60) + flat material cost.
 * Always computable from a classification alone — ships even when the AI
 * work-order generator is disabled or fails.
 */
export function estimateCost(category: ReportCategory): number {
  const rule = RULES[category];
  const labor = LABOR_RATE_PER_HOUR * (rule.est_minutes / 60);
  return Math.round(labor + rule.material_cost);
}

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
  /** Estimated repair cost in whole USD (deterministic floor). */
  est_cost: number;
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
    est_cost: estimateCost(classification.category),
  };
}
