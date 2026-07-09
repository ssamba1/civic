import { beforeEach, describe, expect, it, vi } from "vitest";

// "server-only" throws outside an RSC environment; neutralize for unit tests
// (same convention as lib/notify/deliver.test.ts, lib/resident-data.test.ts).
vi.mock("server-only", () => ({}));

// calendar.ts calls createServerClient() internally (no DI), so the module
// itself is mocked — the chain builder below stands in for supabase-js's
// thenable query builder, same shape as lib/ai/crew-assign.test.ts's mockDb
// but extended with .gte()/.lt() for the created_at window.
vi.mock("@/lib/db/client", () => ({
  createServerClient: vi.fn(),
}));

import { createServerClient } from "@/lib/db/client";
import { fetchCalendarWorkOrders } from "./calendar";

interface MockResponse {
  data?: unknown;
  error?: { message: string } | null;
}

function mockDb(response: MockResponse) {
  const filters: Record<string, unknown> = {};
  const chain = {
    select() {
      return chain;
    },
    eq(col: string, val: unknown) {
      filters[col] = val;
      return chain;
    },
    gte(col: string, val: unknown) {
      filters[`gte:${col}`] = val;
      return chain;
    },
    lt(col: string, val: unknown) {
      filters[`lt:${col}`] = val;
      return chain;
    },
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable — mirrors supabase-js's query builder resolving via then().
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
  const db = { from: vi.fn(() => chain) };
  return {
    db: db as unknown as ReturnType<typeof createServerClient>,
    filters,
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "wo-1",
    team_key: "streets_roads",
    crew_type: "paving",
    assigned_crew_id: "crew-1",
    dispatched_at: "2026-07-10T14:00:00.000Z",
    completed_at: null,
    created_at: "2026-07-01T09:00:00.000Z",
    priority_score: 5,
    reports: {
      status: "open",
      address: "123 Main St",
      city_id: "city-1",
      classifications: { category: "pothole" },
    },
    crews: { name: "North Paving" },
    ...overrides,
  };
}

describe("fetchCalendarWorkOrders", () => {
  beforeEach(() => {
    vi.mocked(createServerClient).mockReset();
  });

  it("maps a happy-path row, including the crews/classifications embeds", async () => {
    const { db } = mockDb({ data: [row()] });
    vi.mocked(createServerClient).mockReturnValue(db);

    const result = await fetchCalendarWorkOrders(
      "city-1",
      "2026-07-01",
      "2026-08-01",
    );

    expect(result).toEqual([
      {
        id: "wo-1",
        title: "123 Main St",
        category: "pothole",
        teamKey: "streets_roads",
        crewType: "paving",
        crewId: "crew-1",
        crewName: "North Paving",
        status: "open",
        calendarDate: "2026-07-10",
        dispatchedAt: "2026-07-10T14:00:00.000Z",
        completedAt: null,
        priorityScore: 5,
      },
    ]);
  });

  it("returns [] (never throws) when the query errors", async () => {
    const { db } = mockDb({
      data: null,
      error: { message: "relation does not exist" },
    });
    vi.mocked(createServerClient).mockReturnValue(db);

    const result = await fetchCalendarWorkOrders(
      "city-1",
      "2026-07-01",
      "2026-08-01",
    );
    expect(result).toEqual([]);
  });

  it("falls back to created_at for calendarDate when dispatched_at is null", async () => {
    const { db } = mockDb({
      data: [
        row({ dispatched_at: null, created_at: "2026-07-15T09:00:00.000Z" }),
      ],
    });
    vi.mocked(createServerClient).mockReturnValue(db);

    const result = await fetchCalendarWorkOrders(
      "city-1",
      "2026-07-01",
      "2026-08-01",
    );
    expect(result[0]?.calendarDate).toBe("2026-07-15");
    expect(result[0]?.dispatchedAt).toBeNull();
  });

  it("marks a work order completed when completed_at is set", async () => {
    const { db } = mockDb({
      data: [row({ completed_at: "2026-07-12T00:00:00.000Z" })],
    });
    vi.mocked(createServerClient).mockReturnValue(db);

    const result = await fetchCalendarWorkOrders(
      "city-1",
      "2026-07-01",
      "2026-08-01",
    );
    expect(result[0]?.status).toBe("completed");
  });

  it("excludes work orders whose report is closed/merged/rejected", async () => {
    const { db } = mockDb({
      data: [
        row({
          id: "dead-1",
          reports: { ...row().reports, status: "rejected" },
        }),
        row({ id: "alive-1" }),
      ],
    });
    vi.mocked(createServerClient).mockReturnValue(db);

    const result = await fetchCalendarWorkOrders(
      "city-1",
      "2026-07-01",
      "2026-08-01",
    );
    expect(result.map((r) => r.id)).toEqual(["alive-1"]);
  });

  it("drops rows whose calendarDate falls outside [fromISO, toISO) after the widened fetch", async () => {
    const { db } = mockDb({
      data: [
        // Created well before the window, dispatched even earlier — outside
        // the visible range even after the created_at lookback widening.
        row({
          id: "too-early",
          created_at: "2026-05-01T00:00:00.000Z",
          dispatched_at: "2026-05-02T00:00:00.000Z",
        }),
        row({ id: "in-range" }),
      ],
    });
    vi.mocked(createServerClient).mockReturnValue(db);

    const result = await fetchCalendarWorkOrders(
      "city-1",
      "2026-07-01",
      "2026-08-01",
    );
    expect(result.map((r) => r.id)).toEqual(["in-range"]);
  });

  it("falls back to a placeholder title when the report has no address", async () => {
    const { db } = mockDb({
      data: [row({ reports: { ...row().reports, address: null } })],
    });
    vi.mocked(createServerClient).mockReturnValue(db);

    const result = await fetchCalendarWorkOrders(
      "city-1",
      "2026-07-01",
      "2026-08-01",
    );
    expect(result[0]?.title).toBe("Untitled report");
  });

  it("tolerates the classifications embed arriving as a single-element array", async () => {
    const { db } = mockDb({
      data: [
        row({
          reports: {
            ...row().reports,
            classifications: [{ category: "pothole" }],
          },
        }),
      ],
    });
    vi.mocked(createServerClient).mockReturnValue(db);

    const result = await fetchCalendarWorkOrders(
      "city-1",
      "2026-07-01",
      "2026-08-01",
    );
    expect(result[0]?.category).toBe("pothole");
  });

  it("returns [] when createServerClient itself throws", async () => {
    vi.mocked(createServerClient).mockImplementation(() => {
      throw new Error("boom");
    });

    const result = await fetchCalendarWorkOrders(
      "city-1",
      "2026-07-01",
      "2026-08-01",
    );
    expect(result).toEqual([]);
  });
});
