import { describe, expect, it } from "vitest";
import type { ExpiringWarrantyJoinRow } from "./sweep";
import {
  daysUntil,
  shapeExpiringWarranties,
  tallyOpenReportsByJob,
} from "./sweep";

const TODAY = "2026-08-23";

function joinRow(
  over: Partial<ExpiringWarrantyJoinRow> = {},
): ExpiringWarrantyJoinRow {
  return {
    id: "w-1",
    warranty_type: "workmanship",
    ends_on: "2026-09-22",
    capital_job_id: "job-1",
    capital_jobs: {
      id: "job-1",
      contract_ref: "2024-17",
      job_type: "resurfacing",
      completed_at: "2024-09-22",
      contractor_id: "c-1",
    },
    ...over,
  };
}

describe("daysUntil", () => {
  it("counts whole days to a future date", () => {
    expect(daysUntil(TODAY, "2026-08-30")).toBe(7);
  });

  it("returns 0 on the expiry date itself", () => {
    expect(daysUntil(TODAY, TODAY)).toBe(0);
  });

  it("returns a negative count for a lapsed window", () => {
    expect(daysUntil(TODAY, "2026-08-20")).toBe(-3);
  });
});

describe("tallyOpenReportsByJob", () => {
  it("counts open reports per capital job", () => {
    const counts = tallyOpenReportsByJob([
      { capital_job_id: "job-1" },
      { capital_job_id: "job-1" },
      { capital_job_id: "job-2" },
    ]);
    expect(counts).toEqual({ "job-1": 2, "job-2": 1 });
  });

  it("ignores rows with no capital job", () => {
    expect(tallyOpenReportsByJob([{ capital_job_id: null }])).toEqual({});
  });

  it("returns an empty tally for no rows", () => {
    expect(tallyOpenReportsByJob([])).toEqual({});
  });
});

describe("shapeExpiringWarranties", () => {
  it("shapes a joined row into the sweep view model", () => {
    const [row] = shapeExpiringWarranties(
      [joinRow()],
      { "job-1": 4 },
      { "c-1": "Acme Paving" },
      TODAY,
    );
    expect(row).toEqual({
      warrantyId: "w-1",
      warrantyType: "workmanship",
      endsOn: "2026-09-22",
      daysRemaining: 30,
      capitalJobId: "job-1",
      contractRef: "2024-17",
      jobType: "resurfacing",
      completedAt: "2024-09-22",
      contractorId: "c-1",
      contractorName: "Acme Paving",
      openReportCount: 4,
    });
  });

  it("defaults the open-report count to 0 and the contractor name to null", () => {
    const [row] = shapeExpiringWarranties([joinRow()], {}, {}, TODAY);
    expect(row.openReportCount).toBe(0);
    expect(row.contractorName).toBeNull();
  });

  it("accepts the array shape PostgREST may return for the embedded job", () => {
    const [row] = shapeExpiringWarranties(
      [
        joinRow({
          capital_jobs: [
            {
              id: "job-1",
              contract_ref: "2024-17",
              job_type: "resurfacing",
              completed_at: "2024-09-22",
              contractor_id: "c-1",
            },
          ],
        }),
      ],
      {},
      {},
      TODAY,
    );
    expect(row.capitalJobId).toBe("job-1");
    expect(row.contractRef).toBe("2024-17");
  });

  it("drops a warranty whose capital job did not come back", () => {
    expect(
      shapeExpiringWarranties([joinRow({ capital_jobs: null })], {}, {}, TODAY),
    ).toEqual([]);
  });

  it("sorts soonest-expiring first, then by open report count", () => {
    const rows = shapeExpiringWarranties(
      [
        joinRow({ id: "late", ends_on: "2026-10-01" }),
        joinRow({ id: "soon-quiet", ends_on: "2026-08-25" }),
        joinRow({
          id: "soon-busy",
          ends_on: "2026-08-25",
          capital_job_id: "job-2",
          capital_jobs: {
            id: "job-2",
            contract_ref: "2024-18",
            job_type: "resurfacing",
            completed_at: "2024-09-22",
            contractor_id: "c-1",
          },
        }),
      ],
      { "job-2": 5 },
      {},
      TODAY,
    );
    expect(rows.map((r) => r.warrantyId)).toEqual([
      "soon-busy",
      "soon-quiet",
      "late",
    ]);
    expect(rows[0].daysRemaining).toBe(2);
  });
});
