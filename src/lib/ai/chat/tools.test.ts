import { describe, expect, it, vi } from "vitest";
import type { ChatContext } from "./context";
import { buildChatTools } from "./tools";

/** Minimal chainable fake of the supabase query builder. */
function fakeSupabase(rows: unknown[]) {
  const calls: { table?: string; filters: [string, unknown][]; limit?: number } = {
    filters: [],
  };
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn((col: string, val: unknown) => {
      calls.filters.push([col, val]);
      return builder;
    }),
    order: vi.fn(() => builder),
    limit: vi.fn((n: number) => {
      calls.limit = n;
      return Promise.resolve({ data: rows, error: null });
    }),
    maybeSingle: vi.fn(() => Promise.resolve({ data: rows[0] ?? null, error: null })),
  };
  const supabase = {
    from: vi.fn((table: string) => {
      calls.table = table;
      return builder;
    }),
  };
  return { supabase: supabase as unknown as ChatContext["supabase"], calls };
}

function ctx(overrides: Partial<ChatContext>, rows: unknown[] = []): {
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
    const ok = (await tools.navigateTo.execute({ route: "/user/my-reports" }, {} as never)) as {
      navigate?: string;
    };
    expect(ok.navigate).toBe("/user/my-reports");
  });

  it("navigateTo refuses a staff route for a resident", async () => {
    const { context } = ctx({ role: "resident" });
    const tools = buildChatTools(context);
    const denied = (await tools.navigateTo.execute({ route: "/staff" }, {} as never)) as {
      error?: string;
    };
    expect(denied.error).toBeTruthy();
    expect((denied as { navigate?: string }).navigate).toBeUndefined();
  });

  it("searchHelpDocs returns corpus snippets", async () => {
    const { context } = ctx({});
    const tools = buildChatTools(context);
    const out = (await tools.searchHelpDocs.execute({ query: "blur faces" }, {} as never)) as {
      results: { id: string }[];
    };
    expect(out.results[0]?.id).toBe("privacy-blur");
  });
});
