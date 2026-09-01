import { describe, expect, it } from "vitest";
import type { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import { autoAssignCrew, type CrewCandidate, pickCrew } from "./crew-assign";

const log = createLogger("crew-assign-test");

function candidate(overrides: Partial<CrewCandidate>): CrewCandidate {
  return {
    id: "id",
    name: "Crew",
    memberCount: 0,
    openWorkOrders: 0,
    openMinutes: 0,
    lastAssignedAt: null,
    ...overrides,
  };
}

describe("pickCrew", () => {
  it("returns null with no candidates", () => {
    expect(pickCrew([])).toBeNull();
  });

  it("prefers a staffed crew over a hollow shell, regardless of load", () => {
    const hollow = candidate({ id: "hollow", name: "A", openMinutes: 0 });
    const staffed = candidate({
      id: "staffed",
      name: "Z",
      memberCount: 2,
      openWorkOrders: 9,
      openMinutes: 900,
    });
    expect(pickCrew([hollow, staffed])?.id).toBe("staffed");
  });

  it("still assigns a hollow shell when it is the only candidate", () => {
    const hollow = candidate({ id: "hollow" });
    expect(pickCrew([hollow])?.id).toBe("hollow");
  });

  it("prefers the lowest workload-hours ÷ crew size among staffed candidates", () => {
    // Big crew carries more raw minutes but less per head: 300/3 = 100 vs
    // 120/1 = 120. The per-capita balancer must pick the big crew.
    const big = candidate({
      id: "big",
      name: "A",
      memberCount: 3,
      openWorkOrders: 5,
      openMinutes: 300,
    });
    const small = candidate({
      id: "small",
      name: "Z",
      memberCount: 1,
      openWorkOrders: 1,
      openMinutes: 120,
    });
    expect(pickCrew([big, small])?.id).toBe("big");
  });

  it("breaks a load tie by fewest open work orders", () => {
    // Equal per-capita load (0), differ only in raw open count.
    const many = candidate({
      id: "many",
      name: "A",
      memberCount: 2,
      openWorkOrders: 4,
    });
    const few = candidate({
      id: "few",
      name: "Z",
      memberCount: 2,
      openWorkOrders: 1,
    });
    expect(pickCrew([many, few])?.id).toBe("few");
  });

  it("breaks a load+count tie by least-recently-assigned (round-robin)", () => {
    // Same load and open count; the crew idle longest (smaller timestamp, or
    // never = null) is next.
    const recent = candidate({
      id: "recent",
      name: "A",
      memberCount: 1,
      lastAssignedAt: 2000,
    });
    const stale = candidate({
      id: "stale",
      name: "Z",
      memberCount: 1,
      lastAssignedAt: 1000,
    });
    expect(pickCrew([recent, stale])?.id).toBe("stale");
    // never-assigned (null) beats any timestamp.
    const never = candidate({ id: "never", name: "M", memberCount: 1 });
    expect(pickCrew([recent, stale, never])?.id).toBe("never");
  });

  it("breaks full ties by name for deterministic re-runs", () => {
    const b = candidate({ id: "b", name: "Bravo", memberCount: 1 });
    const a = candidate({ id: "a", name: "Alpha", memberCount: 1 });
    expect(pickCrew([b, a])?.id).toBe("a");
    // Input order must not matter.
    expect(pickCrew([a, b])?.id).toBe("a");
  });

  it("does not mutate the input array", () => {
    const input = [
      candidate({ id: "b", name: "B" }),
      candidate({ id: "a", name: "A" }),
    ];
    pickCrew(input);
    expect(input.map((c) => c.id)).toEqual(["b", "a"]);
  });
});

// ---------------------------------------------------------------------------
// autoAssignCrew, chainable supabase mock. Each from(table) call consumes the
// next queued response for that table; every builder method returns the chain
// and awaiting it resolves the response (mirrors supabase-js's thenable API).
// ---------------------------------------------------------------------------

interface MockResponse {
  data?: unknown;
  error?: { message: string } | null;
}

interface CallLogEntry {
  table: string;
  method: "select" | "update";
  payload?: unknown;
  filters: Record<string, unknown>;
}

function mockDb(queues: Record<string, MockResponse[]>) {
  const calls: CallLogEntry[] = [];
  const db = {
    from(table: string) {
      const response = (queues[table] ?? []).shift() ?? {
        data: null,
        error: { message: `no mock for ${table}` },
      };
      const entry: CallLogEntry = { table, method: "select", filters: {} };
      calls.push(entry);
      const chain = {
        select() {
          return chain;
        },
        update(payload: unknown) {
          entry.method = "update";
          entry.payload = payload;
          return chain;
        },
        eq(col: string, val: unknown) {
          entry.filters[col] = val;
          return chain;
        },
        in(col: string, vals: unknown) {
          entry.filters[col] = vals;
          return chain;
        },
        is(col: string, val: unknown) {
          entry.filters[`is:${col}`] = val;
          return chain;
        },
        // biome-ignore lint/suspicious/noThenProperty: intentional thenable, supabase-js query builders resolve via then(), the mock must mirror that.
        then(
          resolve: (value: MockResponse) => unknown,
          reject?: (reason: unknown) => unknown,
        ) {
          return Promise.resolve({ error: null, ...response }).then(
            resolve,
            reject,
          );
        },
      };
      return chain;
    },
  };
  // Test double for the narrow query surface autoAssignCrew touches; the full
  // SupabaseClient type is far wider than what the function calls.
  return { db: db as unknown as ReturnType<typeof createServerClient>, calls };
}

const OPTS = {
  workOrderId: "wo-1",
  cityId: "city-1",
  teamKey: "streets_roads",
  crewType: "paving",
  log,
};

describe("autoAssignCrew", () => {
  it("assigns the ranked winner and guards against clobbering (is null)", async () => {
    const { db, calls } = mockDb({
      crews: [
        {
          data: [
            { id: "hollow", name: "Hollow" },
            { id: "staffed", name: "Staffed" },
          ],
        },
      ],
      crew_members: [{ data: [{ crew_id: "staffed" }] }],
      work_orders: [
        { data: [{ assigned_crew_id: "staffed" }] }, // open-load query
        { data: null }, // the assignment update
      ],
    });

    const picked = await autoAssignCrew(db, OPTS);
    expect(picked).toBe("staffed");

    const update = calls.find((c) => c.method === "update");
    expect(update?.table).toBe("work_orders");
    expect(update?.payload).toEqual({ assigned_crew_id: "staffed" });
    expect(update?.filters.id).toBe("wo-1");
    // Idempotency guard: never overwrite an existing (staff) assignment.
    expect(update?.filters["is:assigned_crew_id"]).toBeNull();
  });

  it("returns null without updating when no crew matches", async () => {
    const { db, calls } = mockDb({ crews: [{ data: [] }] });
    expect(await autoAssignCrew(db, OPTS)).toBeNull();
    expect(calls.some((c) => c.method === "update")).toBe(false);
  });

  it("returns null (never throws) when the crews query fails", async () => {
    const { db } = mockDb({
      crews: [{ data: null, error: { message: "relation does not exist" } }],
    });
    expect(await autoAssignCrew(db, OPTS)).toBeNull();
  });

  it("degrades roster/load lookups to zero counts on error and still assigns", async () => {
    const { db, calls } = mockDb({
      crews: [{ data: [{ id: "only", name: "Only" }] }],
      crew_members: [{ data: null, error: { message: "boom" } }],
      work_orders: [
        { data: null, error: { message: "boom" } }, // load query fails
        { data: null }, // update still proceeds
      ],
    });
    expect(await autoAssignCrew(db, OPTS)).toBe("only");
    expect(calls.some((c) => c.method === "update")).toBe(true);
  });

  it("does not count work orders of rejected/merged/closed reports as load", async () => {
    const { db } = mockDb({
      crews: [
        {
          data: [
            { id: "alpha", name: "Alpha" },
            { id: "bravo", name: "Bravo" },
          ],
        },
      ],
      crew_members: [{ data: [{ crew_id: "alpha" }, { crew_id: "bravo" }] }],
      work_orders: [
        {
          // Alpha's only assignment belongs to a rejected report. Dead work,
          // never completed_at-stamped. Counting it would flip the pick to
          // Bravo; excluding it makes both 0 and Alpha wins the name tie.
          data: [
            { assigned_crew_id: "alpha", reports: { status: "rejected" } },
          ],
        },
        { data: null }, // the assignment update
      ],
    });
    expect(await autoAssignCrew(db, OPTS)).toBe("alpha");
  });

  it("balances by workload-minutes ÷ crew size, not raw open count", async () => {
    const { db } = mockDb({
      crews: [
        {
          data: [
            { id: "big", name: "Big Crew" },
            { id: "small", name: "Small Crew" },
          ],
        },
      ],
      // Big crew has 3 members, Small has 1.
      crew_members: [
        {
          data: [
            { crew_id: "big" },
            { crew_id: "big" },
            { crew_id: "big" },
            { crew_id: "small" },
          ],
        },
      ],
      work_orders: [
        {
          // Big: 300 min over 3 heads = 100/head. Small: 120 min over 1 = 120.
          // Raw count favors Small (1 vs 2) but per-capita favors Big.
          data: [
            {
              assigned_crew_id: "big",
              est_minutes: 150,
              created_at: "2026-07-01T00:00:00Z",
              reports: { status: "open" },
            },
            {
              assigned_crew_id: "big",
              est_minutes: 150,
              created_at: "2026-07-02T00:00:00Z",
              reports: { status: "open" },
            },
            {
              assigned_crew_id: "small",
              est_minutes: 120,
              created_at: "2026-07-03T00:00:00Z",
              reports: { status: "open" },
            },
          ],
        },
        { data: null }, // the assignment update
      ],
    });
    expect(await autoAssignCrew(db, OPTS)).toBe("big");
  });

  it("filters candidates by city, team, type, and active", async () => {
    const { db, calls } = mockDb({
      crews: [{ data: [] }],
    });
    await autoAssignCrew(db, OPTS);
    const crewQuery = calls.find((c) => c.table === "crews");
    expect(crewQuery?.filters).toMatchObject({
      city_id: "city-1",
      team_key: "streets_roads",
      crew_type: "paving",
      active: true,
    });
  });

  it("honors a crew_hint that exactly matches a candidate (skips load ranking)", async () => {
    const { db, calls } = mockDb({
      // Hint hit: no crew_members / open-load queries should run at all.
      crews: [
        {
          data: [
            { id: "north", name: "North Paving" },
            { id: "south", name: "South Paving" },
          ],
        },
      ],
      work_orders: [{ data: null }], // the assignment update only
    });

    const picked = await autoAssignCrew(db, {
      ...OPTS,
      crewHint: "  south paving ", // case/whitespace-insensitive match
    });
    expect(picked).toBe("south");
    expect(calls.some((c) => c.table === "crew_members")).toBe(false);
    const update = calls.find((c) => c.method === "update");
    expect(update?.payload).toEqual({ assigned_crew_id: "south" });
    expect(update?.filters["is:assigned_crew_id"]).toBeNull();
  });

  it("ignores a hint that matches no candidate and falls back to ranking", async () => {
    const { db, calls } = mockDb({
      crews: [
        {
          data: [
            { id: "hollow", name: "Hollow" },
            { id: "staffed", name: "Staffed" },
          ],
        },
      ],
      crew_members: [{ data: [{ crew_id: "staffed" }] }],
      work_orders: [
        { data: [] }, // open-load query
        { data: null }, // the assignment update
      ],
    });

    const picked = await autoAssignCrew(db, {
      ...OPTS,
      crewHint: "Imaginary Crew",
    });
    expect(picked).toBe("staffed");
    expect(calls.some((c) => c.table === "crew_members")).toBe(true);
  });

  it("treats a null/absent hint exactly like before", async () => {
    const { db } = mockDb({
      crews: [{ data: [{ id: "only", name: "Only" }] }],
      crew_members: [{ data: [] }],
      work_orders: [{ data: [] }, { data: null }],
    });
    expect(await autoAssignCrew(db, { ...OPTS, crewHint: null })).toBe("only");
  });
});
