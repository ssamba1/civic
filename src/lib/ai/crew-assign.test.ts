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
    ...overrides,
  };
}

describe("pickCrew", () => {
  it("returns null with no candidates", () => {
    expect(pickCrew([])).toBeNull();
  });

  it("prefers a staffed crew over a hollow shell, regardless of load", () => {
    const hollow = candidate({ id: "hollow", name: "A", openWorkOrders: 0 });
    const staffed = candidate({
      id: "staffed",
      name: "Z",
      memberCount: 2,
      openWorkOrders: 9,
    });
    expect(pickCrew([hollow, staffed])?.id).toBe("staffed");
  });

  it("still assigns a hollow shell when it is the only candidate", () => {
    const hollow = candidate({ id: "hollow" });
    expect(pickCrew([hollow])?.id).toBe("hollow");
  });

  it("prefers the least-loaded crew among staffed candidates", () => {
    const busy = candidate({
      id: "busy",
      name: "A",
      memberCount: 3,
      openWorkOrders: 5,
    });
    const idle = candidate({
      id: "idle",
      name: "Z",
      memberCount: 1,
      openWorkOrders: 1,
    });
    expect(pickCrew([busy, idle])?.id).toBe("idle");
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
// autoAssignCrew — chainable supabase mock. Each from(table) call consumes the
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
        // biome-ignore lint/suspicious/noThenProperty: intentional thenable — supabase-js query builders resolve via then(), the mock must mirror that.
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
});
