// @vitest-environment node
import { findDuplicate } from "./dedup";

// Minimal logger stub — findDuplicate only calls log.error.
function makeLog() {
  return {
    correlationId: "test",
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    // biome-ignore lint/suspicious/noExplicitAny: test stub stands in for the logger
  } as any;
}

// Fake supabase whose .rpc(...).maybeSingle() resolves to the given result, or
// whose .rpc throws when `throws` is set.
function makeSupabase(opts: {
  result?: { data: unknown; error: { message: string } | null };
  throws?: boolean;
}) {
  const maybeSingle = vi.fn(() =>
    Promise.resolve(opts.result ?? { data: null, error: null }),
  );
  const rpc = vi.fn(() => {
    if (opts.throws) throw new Error("rpc blew up");
    return { maybeSingle };
  });
  // biome-ignore lint/suspicious/noExplicitAny: structural stub for the supabase client
  return { client: { rpc } as any, rpc, maybeSingle };
}

describe("findDuplicate", () => {
  it("maps a matching RPC row to a DuplicateMatch", async () => {
    const { client, rpc } = makeSupabase({
      result: {
        data: {
          primary_report_id: "earlier-1",
          distance_m: 12.34,
          similarity_score: 0.75,
        },
        error: null,
      },
    });

    const match = await findDuplicate(client, "report-9", makeLog());

    expect(match).toEqual({
      primaryReportId: "earlier-1",
      distanceM: 12.34,
      similarityScore: 0.75,
    });
    // Called the right RPC with the report id and a radius.
    expect(rpc).toHaveBeenCalledWith(
      "find_duplicate_report",
      expect.objectContaining({ _report_id: "report-9", _window_days: 30 }),
    );
  });

  it("returns null when no duplicate row is found", async () => {
    const { client } = makeSupabase({ result: { data: null, error: null } });
    const match = await findDuplicate(client, "report-9", makeLog());
    expect(match).toBeNull();
  });

  it("returns null and logs when the RPC errors (e.g. un-migrated DB)", async () => {
    const log = makeLog();
    const { client } = makeSupabase({
      result: { data: null, error: { message: "function does not exist" } },
    });

    const match = await findDuplicate(client, "report-9", log);

    expect(match).toBeNull();
    expect(log.error).toHaveBeenCalledWith(
      "dedup_rpc_failed",
      undefined,
      expect.objectContaining({ reportId: "report-9" }),
    );
  });

  it("returns null and logs when the RPC throws", async () => {
    const log = makeLog();
    const { client } = makeSupabase({ throws: true });

    const match = await findDuplicate(client, "report-9", log);

    expect(match).toBeNull();
    expect(log.error).toHaveBeenCalledWith(
      "dedup_unexpected_error",
      undefined,
      expect.objectContaining({ reportId: "report-9" }),
    );
  });
});
