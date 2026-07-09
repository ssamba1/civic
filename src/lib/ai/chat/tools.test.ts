import { describe, expect, it, vi } from "vitest";
import type { ChatContext } from "./context";
import { buildChatTools } from "./tools";

/** Minimal chainable fake of the supabase query builder. */
function fakeSupabase(rows: unknown[]) {
  const calls: {
    table?: string;
    filters: [string, unknown][];
    limit?: number;
  } = {
    filters: [],
  };
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn((col: string, val: unknown) => {
      calls.filters.push([col, val]);
      return builder;
    }),
    order: vi.fn(() => builder),
    in: vi.fn((col: string, vals: unknown) => {
      calls.filters.push([col, vals]);
      return Promise.resolve({ data: rows, error: null });
    }),
    limit: vi.fn((n: number) => {
      calls.limit = n;
      return Promise.resolve({ data: rows, error: null });
    }),
    maybeSingle: vi.fn(() =>
      Promise.resolve({ data: rows[0] ?? null, error: null }),
    ),
  };
  const supabase = {
    from: vi.fn((table: string) => {
      calls.table = table;
      return builder;
    }),
  };
  return { supabase: supabase as unknown as ChatContext["supabase"], calls };
}

function ctx(
  overrides: Partial<ChatContext>,
  rows: unknown[] = [],
): {
  context: ChatContext;
  calls: ReturnType<typeof fakeSupabase>["calls"];
} {
  const { supabase, calls } = fakeSupabase(rows);
  return {
    context: {
      supabase,
      userId: "u1",
      role: "resident",
      citySlug: "cumming",
      ...overrides,
    },
    calls,
  };
}

describe("buildChatTools", () => {
  it("getMyReports filters by the caller's id and is bounded", async () => {
    const { context, calls } = ctx({ userId: "u1" }, [
      { id: "r1", status: "open", address: "1 Main", created_at: "2026-06-01" },
    ]);
    const tools = buildChatTools(context);
    const out = await tools.getMyReports.execute({}, {} as never);
    expect(calls.table).toBe("reports");
    expect(calls.filters).toContainEqual(["reporter_id", "u1"]);
    expect(typeof calls.limit).toBe("number");
    expect(JSON.stringify(out)).toContain("r1");
  });

  it("getMyReports tells anon users to sign in and never queries", async () => {
    const { context, calls } = ctx({ userId: null, role: "anon" });
    const tools = buildChatTools(context);
    const out = (await tools.getMyReports.execute({}, {} as never)) as {
      error?: string;
    };
    expect(out.error).toMatch(/sign in/i);
    expect(calls.table).toBeUndefined();
  });

  it("navigateTo returns the route when allowed for the role", async () => {
    const { context } = ctx({ role: "resident" });
    const tools = buildChatTools(context);
    const ok = (await tools.navigateTo.execute(
      { route: "/user/my-reports" },
      {} as never,
    )) as {
      navigate?: string;
    };
    expect(ok.navigate).toBe("/user/my-reports");
  });

  it("navigateTo refuses a staff route for a resident", async () => {
    const { context } = ctx({ role: "resident" });
    const tools = buildChatTools(context);
    const denied = (await tools.navigateTo.execute(
      { route: "/staff" },
      {} as never,
    )) as {
      error?: string;
    };
    expect(denied.error).toBeTruthy();
    expect((denied as { navigate?: string }).navigate).toBeUndefined();
  });

  it("searchHelpDocs returns corpus snippets", async () => {
    const { context } = ctx({});
    const tools = buildChatTools(context);
    const out = (await tools.searchHelpDocs.execute(
      { query: "blur faces" },
      {} as never,
    )) as {
      results: { id: string }[];
    };
    expect(out.results[0]?.id).toBe("privacy-blur");
  });

  it("does NOT expose staff tools to resident/anon scope", () => {
    const resident = buildChatTools(ctx({ role: "resident" }).context);
    expect("getSlaOverdueReports" in resident).toBe(false);
    expect("getTeamWorkload" in resident).toBe(false);
    const anon = buildChatTools(ctx({ role: "anon", userId: null }).context);
    expect("getSlaOverdueReports" in anon).toBe(false);
  });

  it("exposes staff tools to staff scope", () => {
    const staff = buildChatTools(
      ctx({ role: "staff_dispatcher" }).context,
    ) as Record<string, unknown>;
    expect("getSlaOverdueReports" in staff).toBe(true);
    expect("getTeamWorkload" in staff).toBe(true);
  });

  it("getSlaOverdueReports filters overdue by category SLA in the staff's city", async () => {
    const old = new Date(Date.now() - 1000 * 3_600_000).toISOString(); // 1000h old
    const fresh = new Date().toISOString();
    const { context, calls } = ctx({ role: "staff_supervisor" }, [
      { id: "late", category: "pothole", status: "open", created_at: old },
      { id: "ok", category: "pothole", status: "open", created_at: fresh },
    ]);
    const tools = buildChatTools(context) as unknown as Record<
      string,
      { execute: (a: unknown, b: unknown) => Promise<unknown> }
    >;
    const out = (await tools.getSlaOverdueReports.execute({}, {} as never)) as {
      overdueCount: number;
      reports: { id: string }[];
      city: string;
    };
    expect(calls.table).toBe("dashboard_reports_view");
    expect(calls.filters).toContainEqual(["city_slug", "cumming"]);
    expect(out.overdueCount).toBe(1);
    expect(out.reports[0].id).toBe("late");
  });

  it("getTeamWorkload groups open backlog by team_key", async () => {
    const { context } = ctx({ role: "staff_dispatcher" }, [
      { team_key: "streets_roads", status: "open" },
      { team_key: "streets_roads", status: "dispatched" },
      { team_key: null, status: "open" },
    ]);
    const tools = buildChatTools(context) as unknown as Record<
      string,
      { execute: (a: unknown, b: unknown) => Promise<unknown> }
    >;
    const out = (await tools.getTeamWorkload.execute({}, {} as never)) as {
      workload: Record<string, number>;
    };
    expect(out.workload.streets_roads).toBe(2);
    expect(out.workload.unassigned).toBe(1);
  });
});
