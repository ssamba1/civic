import { describe, expect, it } from "vitest";
import { MATCH_TOLERANCE_M } from "./config";
import { pickVerdict } from "./evaluate";
import type {
  CapitalJobRow,
  LiabilityReportInput,
  UtilityPermitRow,
  WarrantyRow,
} from "./types";

const REPORT_AT = "2026-08-23T12:00:00Z";

function report(
  over: Partial<LiabilityReportInput> = {},
): LiabilityReportInput {
  return {
    category: "pothole",
    createdAt: REPORT_AT,
    hasSourceData: true,
    ...over,
  };
}

function job(over: Partial<CapitalJobRow> = {}): CapitalJobRow {
  return {
    id: "job-1",
    contractor_id: "contractor-1",
    contract_ref: "2024-17",
    job_type: "resurfacing",
    completed_at: "2025-06-01",
    source: "arcgis",
    distance_m: 0,
    ...over,
  };
}

function warranty(over: Partial<WarrantyRow> = {}): WarrantyRow {
  return {
    id: "warranty-1",
    capital_job_id: "job-1",
    warranty_type: "workmanship",
    starts_on: "2025-06-01",
    ends_on: "2027-06-01",
    covers_categories: null,
    ...over,
  };
}

function permit(over: Partial<UtilityPermitRow> = {}): UtilityPermitRow {
  return {
    id: "permit-1",
    permittee_name: "Telecom Y",
    permittee_contractor_id: "contractor-2",
    permit_ref: "P-8821",
    liability_ends_on: "2027-01-01",
    distance_m: 0,
    ...over,
  };
}

describe("pickVerdict — verdict selection", () => {
  it("returns contractor_warranty when a warranty is in window", () => {
    const v = pickVerdict([job()], [warranty()], [], report());
    expect(v.verdict).toBe("contractor_warranty");
    expect(v.capitalJobId).toBe("job-1");
    expect(v.warrantyId).toBe("warranty-1");
    expect(v.liableContractorId).toBe("contractor-1");
    expect(v.windowEndsOn).toBe("2027-06-01");
    expect(v.utilityPermitId).toBeNull();
  });

  it("returns utility_restoration when only a permit hits", () => {
    const v = pickVerdict([], [], [permit()], report());
    expect(v.verdict).toBe("utility_restoration");
    expect(v.utilityPermitId).toBe("permit-1");
    expect(v.liableContractorId).toBe("contractor-2");
    expect(v.windowEndsOn).toBe("2027-01-01");
    expect(v.capitalJobId).toBeNull();
    expect(v.warrantyId).toBeNull();
  });

  it("utility beats warranty when BOTH are in window (spec 3.2 precedence)", () => {
    const v = pickVerdict([job()], [warranty()], [permit()], report());
    expect(v.verdict).toBe("utility_restoration");
    expect(v.utilityPermitId).toBe("permit-1");
    expect(v.capitalJobId).toBeNull();
    expect(v.warrantyId).toBeNull();
  });

  it("ignores a permit whose liability window already lapsed", () => {
    const v = pickVerdict(
      [job()],
      [warranty()],
      [permit({ liability_ends_on: "2026-08-22" })],
      report(),
    );
    expect(v.verdict).toBe("contractor_warranty");
  });

  it("ignores a permit with a null liability_ends_on", () => {
    const v = pickVerdict(
      [],
      [],
      [permit({ liability_ends_on: null })],
      report(),
    );
    expect(v.verdict).toBe("city_cost");
  });

  it("counts a permit whose window ends exactly on the report date", () => {
    const v = pickVerdict(
      [],
      [],
      [permit({ liability_ends_on: "2026-08-23" })],
      report(),
    );
    expect(v.verdict).toBe("utility_restoration");
  });
});

describe("pickVerdict — warranty windows and category coverage", () => {
  it("expired warranty produces no match", () => {
    const v = pickVerdict(
      [job()],
      [warranty({ ends_on: "2026-08-22" })],
      [],
      report(),
    );
    expect(v.verdict).toBe("city_cost");
    expect(v.warrantyId).toBeNull();
  });

  it("not-yet-started warranty produces no match", () => {
    const v = pickVerdict(
      [job()],
      [warranty({ starts_on: "2026-09-01", ends_on: "2028-09-01" })],
      [],
      report(),
    );
    expect(v.verdict).toBe("city_cost");
  });

  it("respects covers_categories when the category is listed", () => {
    const v = pickVerdict(
      [job()],
      [warranty({ covers_categories: ["pothole", "drainage"] })],
      [],
      report(),
    );
    expect(v.verdict).toBe("contractor_warranty");
  });

  it("rejects a warranty whose covers_categories excludes the category", () => {
    const v = pickVerdict(
      [job()],
      [warranty({ covers_categories: ["sidewalk_damage"] })],
      [],
      report(),
    );
    expect(v.verdict).toBe("city_cost");
  });

  it("ignores a job completed after the report was filed", () => {
    const v = pickVerdict(
      [job({ completed_at: "2026-08-24" })],
      [warranty()],
      [],
      report(),
    );
    expect(v.verdict).toBe("city_cost");
  });

  it("ignores warranties belonging to a different capital job", () => {
    const v = pickVerdict(
      [job()],
      [warranty({ capital_job_id: "job-other" })],
      [],
      report(),
    );
    expect(v.verdict).toBe("city_cost");
  });
});

describe("pickVerdict — nearest match wins", () => {
  it("picks the nearest warranted job", () => {
    const jobs = [
      job({ id: "far", distance_m: 12 }),
      job({ id: "near", distance_m: 3 }),
    ];
    const warranties = [
      warranty({ id: "w-far", capital_job_id: "far" }),
      warranty({ id: "w-near", capital_job_id: "near" }),
    ];
    const v = pickVerdict(jobs, warranties, [], report());
    expect(v.capitalJobId).toBe("near");
    expect(v.warrantyId).toBe("w-near");
    expect(v.matchDistanceM).toBe(3);
  });

  it("breaks a distance tie with the most recent completed_at", () => {
    const jobs = [
      job({ id: "old", distance_m: 5, completed_at: "2024-01-01" }),
      job({ id: "recent", distance_m: 5, completed_at: "2025-11-01" }),
    ];
    const warranties = [
      warranty({ id: "w-old", capital_job_id: "old" }),
      warranty({ id: "w-recent", capital_job_id: "recent" }),
    ];
    const v = pickVerdict(jobs, warranties, [], report());
    expect(v.capitalJobId).toBe("recent");
  });

  it("skips a nearer job that has no in-window warranty", () => {
    const jobs = [
      job({ id: "near-bare", distance_m: 2 }),
      job({ id: "far-warranted", distance_m: 9 }),
    ];
    const warranties = [warranty({ capital_job_id: "far-warranted" })];
    const v = pickVerdict(jobs, warranties, [], report());
    expect(v.capitalJobId).toBe("far-warranted");
    expect(v.matchDistanceM).toBe(9);
  });

  it("picks the nearest permit", () => {
    const permits = [
      permit({ id: "far", distance_m: 14 }),
      permit({ id: "near", distance_m: 1 }),
    ];
    const v = pickVerdict([], [], permits, report());
    expect(v.utilityPermitId).toBe("near");
    expect(v.matchDistanceM).toBe(1);
  });
});

describe("pickVerdict — empty vs populated sources", () => {
  it("empty source tables for the city produce unknown, NOT city_cost", () => {
    const v = pickVerdict([], [], [], report({ hasSourceData: false }));
    expect(v.verdict).toBe("unknown");
    expect(v.confidence).toBe(0);
    expect(v.capitalJobId).toBeNull();
    expect(v.utilityPermitId).toBeNull();
    expect(v.matchDistanceM).toBeNull();
    expect(v.windowEndsOn).toBeNull();
  });

  it("populated sources with no hit produce city_cost", () => {
    const v = pickVerdict([], [], [], report({ hasSourceData: true }));
    expect(v.verdict).toBe("city_cost");
  });

  it("populated sources whose candidates are all out of window produce city_cost", () => {
    const v = pickVerdict(
      [job()],
      [warranty({ ends_on: "2020-01-01" })],
      [permit({ liability_ends_on: "2020-01-01" })],
      report({ hasSourceData: true }),
    );
    expect(v.verdict).toBe("city_cost");
  });
});

describe("pickVerdict — confidence", () => {
  it("scores a perfect warranty match at 1", () => {
    // distanceScore 1 (0m) * 0.5 + compat 1 * 0.3 + arcgis 1.0 * 0.2 = 1
    const v = pickVerdict(
      [job({ distance_m: 0, source: "arcgis" })],
      [warranty()],
      [],
      report(),
    );
    expect(v.confidence).toBeCloseTo(1, 10);
  });

  it("weights distance, category compatibility and source quality", () => {
    // distance 7.5m of 15m -> 0.5; compat 1; source csv -> 0.7
    // 0.5*0.5 + 0.3*1 + 0.2*0.7 = 0.25 + 0.3 + 0.14 = 0.69
    const v = pickVerdict(
      [job({ distance_m: MATCH_TOLERANCE_M / 2, source: "csv" })],
      [warranty()],
      [],
      report(),
    );
    expect(v.confidence).toBeCloseTo(0.69, 10);
  });

  it("zeroes the compatibility term for an incompatible job type", () => {
    // streetlight report on a resurfacing job: 0.5*1 + 0.3*0 + 0.2*0.5 = 0.6
    const v = pickVerdict(
      [job({ distance_m: 0, source: "manual" })],
      [warranty({ covers_categories: null })],
      [],
      report({ category: "streetlight" }),
    );
    expect(v.verdict).toBe("contractor_warranty");
    expect(v.confidence).toBeCloseTo(0.6, 10);
  });

  it("clamps the distance term to 0 beyond the tolerance", () => {
    // distance 30m > 15m tolerance -> distanceScore clamped 0
    // 0.5*0 + 0.3*1 + 0.2*0.5 = 0.4
    const v = pickVerdict(
      [job({ distance_m: 30, source: "manual" })],
      [warranty()],
      [],
      report(),
    );
    expect(v.confidence).toBeCloseTo(0.4, 10);
  });

  it("keeps confidence within 0..1 for every verdict", () => {
    const all = [
      pickVerdict([job()], [warranty()], [], report()),
      pickVerdict([], [], [permit()], report()),
      pickVerdict([], [], [], report()),
      pickVerdict([], [], [], report({ hasSourceData: false })),
    ];
    for (const v of all) {
      expect(v.confidence).toBeGreaterThanOrEqual(0);
      expect(v.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("scores a utility match on distance only (permits carry no job-type signal)", () => {
    // 0.5*distanceScore + 0.3*1 + 0.2*0.5 -> 0m = 0.9
    const v = pickVerdict([], [], [permit({ distance_m: 0 })], report());
    expect(v.confidence).toBeCloseTo(0.9, 10);
  });
});
