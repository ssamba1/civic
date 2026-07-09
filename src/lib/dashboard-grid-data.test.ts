// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

// Per-table awaitable chainable builder
let responses: Record<string, { data: unknown; error: unknown }>;

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of [
    "select",
    "eq",
    "order",
    "in",
    "limit",
    "not",
    "gt",
    "lte",
  ]) {
    b[m] = () => b;
  }
  // biome-ignore lint/suspicious/noThenProperty: intentional thenable mock of the supabase query builder
  b.then = (resolve: (v: unknown) => unknown) =>
    resolve(responses[table] ?? { data: [], error: null });
  return b;
}

const from = vi.fn((table: string) => makeBuilder(table));
vi.mock("@/lib/db/client", () => ({ createServerClient: () => ({ from }) }));

import { getCityCrewOptions, getGridRows } from "./dashboard-grid-data";

beforeEach(() => {
  responses = {};
  from.mockClear();
});

describe("getCityCrewOptions", () => {
  it("maps DB rows to GridCrewOption shape", async () => {
    responses.crews = {
      data: [
        {
          id: "c1",
          name: "Alpha Crew",
          team_key: "streets_roads",
          crew_type: "paving",
        },
        {
          id: "c2",
          name: "Beta Crew",
          team_key: "parks_forestry",
          crew_type: null,
        },
      ],
      error: null,
    };
    const r = await getCityCrewOptions("city1");
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({
      id: "c1",
      name: "Alpha Crew",
      teamKey: "streets_roads",
      crewType: "paving",
    });
    expect(r[1].crewType).toBeNull();
  });

  it("returns [] on DB error", async () => {
    responses.crews = { data: null, error: { message: "no table" } };
    const r = await getCityCrewOptions("city1");
    expect(r).toEqual([]);
  });

  it("returns [] when no active crews", async () => {
    responses.crews = { data: [], error: null };
    expect(await getCityCrewOptions("city1")).toEqual([]);
  });
});

describe("getGridRows", () => {
  it("flattens classifications and work_orders into GridReportRow", async () => {
    responses.reports = {
      data: [
        {
          id: "r1",
          status: "open",
          address: "123 Main St",
          photo_public_url: null,
          created_at: "2026-06-01T00:00:00Z",
          classifications: {
            category: "pothole",
            subcategory: "large",
            severity: 3,
            is_emergency: false,
          },
          work_orders: {
            id: "wo1",
            department: "streets",
            crew_type: "paving",
            assigned_crew_id: "crew1",
            priority_score: 80,
            est_minutes: 120,
            est_cost: 500,
            wo_source: "ai",
            needs_manual_review: false,
          },
        },
      ],
      error: null,
    };
    responses.crews = {
      data: [{ id: "crew1", name: "Alpha Crew" }],
      error: null,
    };

    const r = await getGridRows("city1");
    expect(r).toHaveLength(1);
    const row = r[0];
    expect(row.report_id).toBe("r1");
    expect(row.category).toBe("pothole");
    expect(row.severity).toBe(3);
    expect(row.is_emergency).toBe(false);
    expect(row.work_order_id).toBe("wo1");
    expect(row.assigned_crew_id).toBe("crew1");
    expect(row.assigned_crew_name).toBe("Alpha Crew");
    expect(row.priority_score).toBe(80);
  });

  it("handles classifications as array (Supabase embed variant)", async () => {
    responses.reports = {
      data: [
        {
          id: "r2",
          status: "dispatched",
          address: null,
          photo_public_url: null,
          created_at: "2026-06-01T00:00:00Z",
          classifications: [
            {
              category: "streetlight",
              subcategory: null,
              severity: 2,
              is_emergency: true,
            },
          ],
          work_orders: [],
        },
      ],
      error: null,
    };
    responses.crews = { data: [], error: null };

    const r = await getGridRows("city1");
    expect(r[0].category).toBe("streetlight");
    expect(r[0].is_emergency).toBe(true);
    expect(r[0].work_order_id).toBeNull();
  });

  it("assigned_crew_name is null when crew not in lookup", async () => {
    responses.reports = {
      data: [
        {
          id: "r3",
          status: "open",
          address: null,
          photo_public_url: null,
          created_at: "2026-06-01T00:00:00Z",
          classifications: null,
          work_orders: {
            id: "wo2",
            department: null,
            crew_type: null,
            assigned_crew_id: "missing-crew",
            priority_score: null,
            est_minutes: null,
            est_cost: null,
            wo_source: null,
            needs_manual_review: false,
          },
        },
      ],
      error: null,
    };
    responses.crews = { data: [], error: null };

    const r = await getGridRows("city1");
    expect(r[0].assigned_crew_id).toBe("missing-crew");
    expect(r[0].assigned_crew_name).toBeNull();
  });

  it("returns [] on reports query error", async () => {
    responses.reports = { data: null, error: { message: "fail" } };
    const r = await getGridRows("city1");
    expect(r).toEqual([]);
  });

  it("degrades to null crew names when crews query errors", async () => {
    responses.reports = {
      data: [
        {
          id: "r4",
          status: "open",
          address: null,
          photo_public_url: null,
          created_at: "2026-06-01T00:00:00Z",
          classifications: null,
          work_orders: {
            id: "wo3",
            department: null,
            crew_type: null,
            assigned_crew_id: "c9",
            priority_score: null,
            est_minutes: null,
            est_cost: null,
            wo_source: null,
            needs_manual_review: false,
          },
        },
      ],
      error: null,
    };
    responses.crews = { data: null, error: { message: "crews boom" } };

    const r = await getGridRows("city1");
    expect(r[0].assigned_crew_name).toBeNull();
  });

  it("needs_manual_review is false when work_orders is null", async () => {
    responses.reports = {
      data: [
        {
          id: "r5",
          status: "open",
          address: null,
          photo_public_url: null,
          created_at: "2026-06-01T00:00:00Z",
          classifications: null,
          work_orders: null,
        },
      ],
      error: null,
    };
    responses.crews = { data: [], error: null };
    const r = await getGridRows("city1");
    expect(r[0].needs_manual_review).toBe(false);
    expect(r[0].work_order_id).toBeNull();
  });
});
