// @vitest-environment node

import type { Classification, ReportCategory } from "@/lib/types";
import { generateWorkOrder } from "./work-order-rules";

// generateWorkOrder is a pure, deterministic function. It imports only TYPES
// (erased at compile time) — no network, DB, or env runtime dependencies — so
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
    ...overrides,
  };
}

function makeMeta(
  overrides: Partial<{
    isSchoolZone: boolean;
    footTrafficWeight: number;
    recurrenceCount: number;
  }> = {},
) {
  return {
    isSchoolZone: false,
    footTrafficWeight: 0,
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
    // priority = severity*2 + footTraffic*1.5 + schoolZone*3 + recurrence + emergency*50
    it("computes the base case (all zero bonuses) as severity*2 only", () => {
      const wo = generateWorkOrder(
        makeClassification({ severity: 3, is_emergency: false }),
        makeMeta({
          isSchoolZone: false,
          footTrafficWeight: 0,
          recurrenceCount: 0,
        }),
      );
      expect(wo.priority_score).toBe(6); // 3*2
    });

    it("adds footTrafficWeight * 1.5", () => {
      const wo = generateWorkOrder(
        makeClassification({
          severity: 0 as unknown as Classification["severity"],
        }),
        makeMeta({ footTrafficWeight: 4 }),
      );
      expect(wo.priority_score).toBe(6); // 0*2 + 4*1.5
    });

    it("adds schoolZone bonus of 3 when isSchoolZone is true", () => {
      const noZone = generateWorkOrder(
        makeClassification({ severity: 1 }),
        makeMeta({ isSchoolZone: false }),
      );
      const withZone = generateWorkOrder(
        makeClassification({ severity: 1 }),
        makeMeta({ isSchoolZone: true }),
      );
      expect(noZone.priority_score).toBe(2); // 1*2
      expect(withZone.priority_score).toBe(5); // 1*2 + 1*3
      expect(withZone.priority_score - noZone.priority_score).toBe(3);
    });

    it("adds recurrenceCount * 1 (raw count)", () => {
      const wo = generateWorkOrder(
        makeClassification({ severity: 1 }),
        makeMeta({ recurrenceCount: 7 }),
      );
      expect(wo.priority_score).toBe(9); // 1*2 + 7
    });

    it("combines all weighted terms correctly", () => {
      // severity 4 -> 8, foot 2 -> 3, schoolZone -> 3, recurrence 5 -> 5, no emergency
      const wo = generateWorkOrder(
        makeClassification({ severity: 4, is_emergency: false }),
        makeMeta({
          isSchoolZone: true,
          footTrafficWeight: 2,
          recurrenceCount: 5,
        }),
      );
      expect(wo.priority_score).toBe(19); // 8 + 3 + 3 + 5
    });

    it("rounds to 2 decimal places", () => {
      // footTrafficWeight 1.337 * 1.5 = 2.0055 -> rounds to 2.01 (plus severity 1*2)
      const wo = generateWorkOrder(
        makeClassification({ severity: 1, is_emergency: false }),
        makeMeta({ footTrafficWeight: 1.337 }),
      );
      expect(wo.priority_score).toBe(4.01); // 2 + 2.0055 = 4.0055 -> 4.01
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

    it("dominates: a low-severity emergency outranks a max-severity non-emergency", () => {
      const maxedNonEmergency = generateWorkOrder(
        makeClassification({ severity: 5, is_emergency: false }),
        makeMeta({
          isSchoolZone: true,
          footTrafficWeight: 5,
          recurrenceCount: 10,
        }),
      );
      const lowEmergency = generateWorkOrder(
        makeClassification({ severity: 1, is_emergency: true }),
        makeMeta({
          isSchoolZone: false,
          footTrafficWeight: 0,
          recurrenceCount: 0,
        }),
      );
      // non-emergency max: 5*2 + 5*1.5 + 3 + 10 = 30.5
      expect(maxedNonEmergency.priority_score).toBe(30.5);
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
        makeMeta({ footTrafficWeight: 2 }),
      );
      expect(wo.priority_score).toBe(59); // 3*2 + 2*1.5 + 50
    });
  });

  describe("determinism", () => {
    it("returns identical output for identical input", () => {
      const c = makeClassification({ category: "tree_down", severity: 4 });
      const m = makeMeta({
        isSchoolZone: true,
        footTrafficWeight: 3,
        recurrenceCount: 2,
      });
      expect(generateWorkOrder(c, m)).toEqual(generateWorkOrder(c, m));
    });
  });
});
