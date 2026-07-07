// @vitest-environment node

import type { NormalizedReport } from "./types";
import { ingestReports } from "./writer";

const BASE = "https://proj.supabase.co";

function rep(over: Partial<NormalizedReport> = {}): NormalizedReport {
  return {
    source: "synthetic",
    location: { lng: -84.13, lat: 34.2 },
    category: "pothole",
    severity: 3,
    status: "open",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

// Recording supabase stub: captures inserted rows per table + job updates.
function makeDb(failTable?: string) {
  const inserts: Record<string, Record<string, unknown>[]> = {};
  const jobUpdates: Record<string, unknown>[] = [];
  const from = vi.fn((table: string) => ({
    insert: vi.fn(async (rows: Record<string, unknown>[]) => {
      if (table === failTable) return { error: { message: "boom" } };
      if (!inserts[table]) inserts[table] = [];
      inserts[table].push(...rows);
      return { error: null };
    }),
    update: vi.fn((patch: Record<string, unknown>) => ({
      eq: vi.fn(async () => {
        jobUpdates.push(patch);
        return { error: null };
      }),
    })),
  }));
  // biome-ignore lint/suspicious/noExplicitAny: structural supabase stub
  return { db: { from } as any, inserts, jobUpdates };
}

describe("ingestReports", () => {
  it("inserts reports, classifications, and work orders in equal counts", async () => {
    const { db, inserts } = makeDb();
    const reports = [
      rep(),
      rep({ category: "streetlight" }),
      rep({ status: "closed", resolvedAt: "2026-01-02T00:00:00.000Z" }),
    ];

    const res = await ingestReports("city-1", reports, {
      db,
      photoBaseUrl: BASE,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.inserted).toBe(3);
    expect(inserts.reports).toHaveLength(3);
    expect(inserts.classifications).toHaveLength(3);
    expect(inserts.work_orders).toHaveLength(3);
  });

  it("builds report rows with source, null reporter, EWKT location, placeholder photo", async () => {
    const { db, inserts } = makeDb();
    await ingestReports(
      "city-1",
      [rep({ source: "arcgis", category: "graffiti" })],
      {
        db,
        photoBaseUrl: BASE,
      },
    );
    const row = inserts.reports[0];
    expect(row).toMatchObject({
      city_id: "city-1",
      source: "arcgis",
      reporter_id: null,
      status: "open",
      created_at: "2026-01-01T00:00:00.000Z",
      location: "SRID=4326;POINT(-84.13 34.2)",
      photo_public_url: `${BASE}/storage/v1/object/public/photos-public/seed/graffiti.jpg`,
    });
  });

  it("backfills work_orders.completed_at from resolvedAt for closed reports", async () => {
    const { db, inserts } = makeDb();
    await ingestReports(
      "city-1",
      [rep({ status: "closed", resolvedAt: "2026-02-02T00:00:00.000Z" })],
      { db, photoBaseUrl: BASE },
    );
    expect(inserts.work_orders[0].completed_at).toBe(
      "2026-02-02T00:00:00.000Z",
    );
    expect(inserts.work_orders[0].wo_source).toBe("rules");
    // pothole deterministic cost floor: 75*(30/60)+60 = 97.5 → 98
    expect(inserts.work_orders[0].est_cost).toBe(98);
  });

  it("drives the provision_jobs lifecycle to ready with counts", async () => {
    const { db, jobUpdates } = makeDb();
    await ingestReports("city-1", [rep(), rep()], {
      db,
      photoBaseUrl: BASE,
      jobId: "job-1",
    });
    const statuses = jobUpdates.map((u) => u.status);
    expect(statuses).toContain("ingesting");
    expect(statuses).toContain("classifying");
    const final = jobUpdates[jobUpdates.length - 1];
    expect(final).toMatchObject({
      status: "ready",
      ingested: 2,
      classified: 2,
    });
  });

  it("marks the job 'error' and returns an error when an insert fails", async () => {
    const { db, jobUpdates } = makeDb("work_orders");
    const res = await ingestReports("city-1", [rep()], {
      db,
      photoBaseUrl: BASE,
      jobId: "job-1",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/^INGEST_WORK_ORDERS/);
    expect(jobUpdates.some((u) => u.status === "error")).toBe(true);
  });

  it("handles an empty report set", async () => {
    const { db, inserts } = makeDb();
    const res = await ingestReports("city-1", [], { db, photoBaseUrl: BASE });
    expect(res.ok && res.data.inserted).toBe(0);
    expect(inserts.reports).toBeUndefined();
  });
});
