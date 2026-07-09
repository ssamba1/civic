import { beforeEach, describe, expect, it, vi } from "vitest";

// Per-table awaitable builder. from(table) yields a builder whose chained
// methods return itself; awaiting resolves to responses[table]. Copied from
// crews.test.ts, extended with `not` for the assigned_crew_id filter.
let responses: Record<string, { data: unknown; error: unknown }>;
function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "in", "not"]) {
    builder[m] = () => builder;
  }
  // biome-ignore lint/suspicious/noThenProperty: intentional thenable mock of the supabase query builder
  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve(responses[table] ?? { data: [], error: null });
  return builder;
}
const from = vi.fn((table: string) => makeBuilder(table));
vi.mock("@/lib/db/client", () => ({ createServerClient: () => ({ from }) }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { aggregateCrewWorkloads, fetchCrewWorkloads } from "./crew-workloads";

const NOW = Date.parse("2026-07-09T00:00:00.000Z");
const DAY = 86_400_000;
// ISO timestamp `days` before NOW.
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

// Row shape mirrors the PostgREST embed the query selects.
function row(
  crewId: string | null,
  status: string,
  reportDaysAgo: number,
  completedDaysAgo: number | null,
) {
  return {
    assigned_crew_id: crewId,
    created_at: ago(reportDaysAgo),
    completed_at: completedDaysAgo === null ? null : ago(completedDaysAgo),
    reports:
      crewId === "__noreport__"
        ? null
        : { status, created_at: ago(reportDaysAgo), city_id: "c1" },
  };
}

beforeEach(() => {
  from.mockClear();
  responses = {};
});

describe("aggregateCrewWorkloads", () => {
  it("rolls up counts, backlog age, and real-timestamp MTTR per crew", () => {
    const rows = [
      row("cr1", "open", 5, null),
      row("cr1", "in_progress", 2, null),
      row("cr1", "closed", 10, 8), // 48h to resolution
      row("cr1", "closed", 6, 5), // 24h to resolution
      row("cr2", "dispatched", 1, null),
      row("cr2", "rejected", 3, null),
    ];
    const wl = aggregateCrewWorkloads(rows, NOW);

    expect(wl.cr1).toEqual({
      crewId: "cr1",
      total: 4,
      byStatus: {
        open: 1,
        dispatched: 0,
        in_progress: 1,
        closed: 2,
        merged: 0,
        rejected: 0,
      },
      openCount: 2,
      closedCount: 2,
      oldestOpenAgeDays: 5, // max of the two backlog ages (5, 2)
      mttrHours: 36, // mean(48, 24)
    });

    expect(wl.cr2.total).toBe(2);
    expect(wl.cr2.openCount).toBe(1); // dispatched is backlog, rejected is not
    expect(wl.cr2.closedCount).toBe(0);
    expect(wl.cr2.oldestOpenAgeDays).toBe(1);
    expect(wl.cr2.mttrHours).toBeNull(); // no completed rows
  });

  it("skips null crew and null (dead-embed) report rows", () => {
    const rows = [
      row(null, "open", 4, null), // unassigned — skipped
      row("__noreport__", "open", 4, null), // reports embed null — skipped
      row("cr9", "open", 4, null),
    ];
    const wl = aggregateCrewWorkloads(rows, NOW);
    expect(Object.keys(wl)).toEqual(["cr9"]);
    expect(wl.cr9.total).toBe(1);
  });

  it("returns an empty record for no rows", () => {
    expect(aggregateCrewWorkloads([], NOW)).toEqual({});
  });
});

describe("fetchCrewWorkloads", () => {
  it("returns aggregated workloads on success", async () => {
    responses = {
      work_orders: {
        data: [row("cr1", "open", 2, null), row("cr1", "closed", 4, 3)],
        error: null,
      },
    };
    const r = await fetchCrewWorkloads("c1", NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.workloads.cr1.total).toBe(2);
      expect(r.workloads.cr1.openCount).toBe(1);
      expect(r.workloads.cr1.mttrHours).toBe(24); // 1 day
    }
  });

  it("returns a tagged failure when the query errors", async () => {
    responses = { work_orders: { data: null, error: { message: "boom" } } };
    expect(await fetchCrewWorkloads("c1", NOW)).toEqual({
      ok: false,
      error: "crew_workloads_query_failed",
    });
  });
});
