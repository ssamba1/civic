// @vitest-environment node

import type { Classification, ReportCategory } from "@/lib/types";
import { estimateCost, generateWorkOrder } from "./work-order-rules";

// generateWorkOrder is a pure, deterministic function. It imports only TYPES
// (erased at compile time) (no network, DB, or env runtime dependencies), so
// there is nothing to vi.mock here. Tests stay fast and deterministic.

function makeClassification(
  overrides: Partial<Classification> = {},
): Classification {
  return {
    category: "pothole",
    subcategory: "edge crack",
    severity: 3,
    hazard_radius_m: 1.5,
    visible_size_estimate: "0.5m x 0.5m",
    is_emergency: false,
    confidence: 0.9,
    reasoning: "test fixture",
    no_issue_detected: false,
    alternate_categories: [],
    ...overrides,
  };
}

function makeMeta(
  overrides: Partial<{
    recurrenceCount: number;
  }> = {},
) {
  return {
    recurrenceCount: 0,
    ...overrides,
  };
}

// Expected category -> rule mapping, mirroring RULES in work-order-rules.ts.
// Kept as an independent source of truth so a drift in either side fails.
const EXPECTED_RULES: Record<
  ReportCategory,
  {
    department: string;
    crew_type: string | null;
    est_minutes: number;
    materials: string[];
  }
> = {
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

const ALL_CATEGORIES = Object.keys(EXPECTED_RULES) as ReportCategory[];

describe("generateWorkOrder", () => {
  describe("category -> department/crew/materials mapping", () => {
    it.each(
      ALL_CATEGORIES,
    )("maps %s to its department, crew, est_minutes, and materials", (category) => {
      const expected = EXPECTED_RULES[category];
      const wo = generateWorkOrder(
        makeClassification({ category }),
        makeMeta(),
      );

      expect(wo.department).toBe(expected.department);
      expect(wo.crew_type).toBe(expected.crew_type);
      expect(wo.est_minutes).toBe(expected.est_minutes);
      expect(wo.materials).toEqual(expected.materials);
    });

    it("returns the materials list for the matched rule", () => {
      const wo = generateWorkOrder(
        makeClassification({ category: "pothole" }),
        makeMeta(),
      );
      expect(wo.materials).toEqual(["cold patch", "tamper"]);
    });
  });

  describe("priority math", () => {
    // priority = severity*2 + recurrence + emergency*50
    it("computes the base case (zero recurrence) as severity*2 only", () => {
      const wo = generateWorkOrder(
        makeClassification({ severity: 3, is_emergency: false }),
        makeMeta({ recurrenceCount: 0 }),
      );
      expect(wo.priority_score).toBe(6); // 3*2
    });

    it("adds recurrenceCount * 1 (raw count)", () => {
      const wo = generateWorkOrder(
        makeClassification({ severity: 1 }),
        makeMeta({ recurrenceCount: 7 }),
      );
      expect(wo.priority_score).toBe(9); // 1*2 + 7
    });

    it("combines severity and recurrence correctly", () => {
      const wo = generateWorkOrder(
        makeClassification({ severity: 4, is_emergency: false }),
        makeMeta({ recurrenceCount: 5 }),
      );
      expect(wo.priority_score).toBe(13); // 4*2 + 5
    });
  });

  describe("emergency override", () => {
    it("adds 50 when is_emergency is true", () => {
      const calm = generateWorkOrder(
        makeClassification({ severity: 2, is_emergency: false }),
        makeMeta(),
      );
      const emergency = generateWorkOrder(
        makeClassification({ severity: 2, is_emergency: true }),
        makeMeta(),
      );
      expect(calm.priority_score).toBe(4); // 2*2
      expect(emergency.priority_score).toBe(54); // 2*2 + 50
      expect(emergency.priority_score - calm.priority_score).toBe(50);
    });

    it("dominates: a low-severity emergency outranks a max-severity, highly-recurring non-emergency", () => {
      const maxedNonEmergency = generateWorkOrder(
        makeClassification({ severity: 5, is_emergency: false }),
        makeMeta({ recurrenceCount: 10 }),
      );
      const lowEmergency = generateWorkOrder(
        makeClassification({ severity: 1, is_emergency: true }),
        makeMeta({ recurrenceCount: 0 }),
      );
      // non-emergency max: 5*2 + 10 = 20
      expect(maxedNonEmergency.priority_score).toBe(20);
      // low emergency: 1*2 + 50 = 52
      expect(lowEmergency.priority_score).toBe(52);
      expect(lowEmergency.priority_score).toBeGreaterThan(
        maxedNonEmergency.priority_score,
      );
    });
  });

  describe('"other" category', () => {
    it("yields department other, crew null, est_minutes 0, empty materials", () => {
      const wo = generateWorkOrder(
        makeClassification({ category: "other" }),
        makeMeta(),
      );
      expect(wo.department).toBe("other");
      expect(wo.crew_type).toBeNull();
      expect(wo.est_minutes).toBe(0);
      expect(wo.materials).toEqual([]);
    });

    it("still computes priority for other-category reports", () => {
      const wo = generateWorkOrder(
        makeClassification({
          category: "other",
          severity: 3,
          is_emergency: true,
        }),
        makeMeta({ recurrenceCount: 2 }),
      );
      expect(wo.priority_score).toBe(58); // 3*2 + 2 + 50
    });
  });

  describe("determinism", () => {
    it("returns identical output for identical input", () => {
      const c = makeClassification({ category: "tree_down", severity: 4 });
      const m = makeMeta({ recurrenceCount: 2 });
      expect(generateWorkOrder(c, m)).toEqual(generateWorkOrder(c, m));
    });
  });

  describe("est_cost (deterministic floor)", () => {
    // cost = $75/hr * (est_minutes / 60) + material_cost, rounded.
    it("computes pothole cost as labor(30min) + materials($60)", () => {
      // 75 * 0.5 = 37.5 labor + 60 materials = 97.5 -> 98
      expect(estimateCost("pothole")).toBe(98);
    });

    it("computes sidewalk_damage cost for a 240-min concrete job", () => {
      // 75 * 4 = 300 labor + 250 materials = 550
      expect(estimateCost("sidewalk_damage")).toBe(550);
    });

    it("returns 0 cost for the 'other' category (no crew, no materials)", () => {
      expect(estimateCost("other")).toBe(0);
    });

    it("includes est_cost in the generated work order", () => {
      const wo = generateWorkOrder(
        makeClassification({ category: "pothole" }),
        makeMeta(),
      );
      expect(wo.est_cost).toBe(98);
    });

    it("cost is independent of priority bonuses (depends only on category)", () => {
      const calm = generateWorkOrder(
        makeClassification({ category: "tree_down" }),
        makeMeta(),
      );
      const busy = generateWorkOrder(
        makeClassification({ category: "tree_down" }),
        makeMeta({ recurrenceCount: 5 }),
      );
      expect(calm.est_cost).toBe(busy.est_cost);
    });
  });
});
