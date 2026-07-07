// @vitest-environment node

import { GEMINI_MODEL } from "@/lib/ai/config";
import { findDuplicate } from "@/lib/ai/dedup";
import { classifyPhoto } from "@/lib/ai/gemini";
import { createServerClient } from "@/lib/db/client";
import type { Classification } from "@/lib/types";
import { runClassifyPipeline } from "./classify-pipeline";

// --- Mocks ----------------------------------------------------------------
// DB + Gemini are fully mocked so their serverEnv imports never execute and we
// never touch the network or a real Supabase. Logger is mocked to kill the
// Sentry side-effect (the only env/network risk left in the import graph).
// generateWorkOrder + sniffImageMime run for real — they are pure.
vi.mock("@/lib/db/client", () => ({ createServerClient: vi.fn() }));
vi.mock("@/lib/ai/gemini", () => ({ classifyPhoto: vi.fn() }));
vi.mock("@/lib/ai/dedup", () => ({ findDuplicate: vi.fn() }));
// DEDUP_REPORTS forced ON so the dedup branch is exercisable; findDuplicate is
// mocked and defaults to undefined (no match), so non-dedup tests fall through
// to normal work-order creation unchanged. Other config exports preserved.
vi.mock("@/lib/ai/config", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/config")>()),
  DEDUP_REPORTS: true,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    correlationId: "test-correlation-id",
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const createServerClientMock = vi.mocked(createServerClient);
const classifyPhotoMock = vi.mocked(classifyPhoto);
const findDuplicateMock = vi.mocked(findDuplicate);

// --- Supabase test double --------------------------------------------------
// Per-table query builder. `.eq()` is used two ways in the pipeline:
//   read:   .select().eq(id).single()      -> resolves via .single()
//   write:  await update(patch).eq(id)     -> awaited terminal
// The `then` property makes `await builder` resolve to the table's write result
// while `.single()` still returns the table's read result on the same object.
type WriteResult = { error: { message: string } | null };
type SingleResult = { data: unknown; error: { message: string } | null };

function makeBuilder(opts: {
  single?: SingleResult;
  write?: WriteResult;
}): Record<string, unknown> {
  const single = opts.single ?? { data: null, error: null };
  const write = opts.write ?? { error: null };
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    insert: vi.fn(() => b),
    update: vi.fn(() => b),
    upsert: vi.fn(() => b),
    single: vi.fn(() => Promise.resolve(single)),
    // Thenable: `await builder` resolves to the write result.
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable that mocks Supabase's awaitable query builder
    then: (
      resolve: (v: WriteResult) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(write).then(resolve, reject),
  });
  return b as ReturnType<typeof makeBuilder> & {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
  };
}

interface SupabaseSetup {
  report?: SingleResult; // reports.select().eq().single()
  reportsWrite?: WriteResult; // reports.update().eq() (status transitions)
  classificationsWrite?: WriteResult; // classifications.upsert()
  workOrder?: SingleResult; // work_orders.upsert().select().single()
  mergesWrite?: WriteResult; // merges.insert()
  rpcResult?: { data: unknown; error: { message: string } | null }; // supabase.rpc()
  download?: { data: unknown; error: { message: string } | null };
}

function makeSupabase(setup: SupabaseSetup) {
  const reports = makeBuilder({
    single: setup.report ?? { data: null, error: null },
    write: setup.reportsWrite ?? { error: null },
  });
  const classifications = makeBuilder({
    write: setup.classificationsWrite ?? { error: null },
  });
  const work_orders = makeBuilder({
    single: setup.workOrder ?? { data: null, error: null },
  });
  const error_log = makeBuilder({ write: { error: null } });
  const merges = makeBuilder({ write: setup.mergesWrite ?? { error: null } });

  const tables = { reports, classifications, work_orders, error_log, merges };

  const download = vi
    .fn()
    .mockResolvedValue(
      setup.download ?? { data: null, error: { message: "no file" } },
    );
  const storageFrom = vi.fn(() => ({ download }));

  const from = vi.fn((t: keyof typeof tables) => tables[t]);

  // rpc() is awaited directly in the pipeline (e.g. bump_work_order_priority on
  // merge). Resolves to a {error} write-result shape.
  const rpc = vi.fn(() =>
    Promise.resolve(setup.rpcResult ?? { data: null, error: null }),
  );

  const client = {
    from,
    rpc,
    storage: { from: storageFrom },
  };

  return {
    client,
    tables,
    from,
    rpc,
    storage: { from: storageFrom, download },
  };
}

// A blob whose magic bytes sniff to image/jpeg (FF D8 FF ...).
function jpegBlob() {
  return {
    arrayBuffer: () =>
      Promise.resolve(new Uint8Array([0xff, 0xd8, 0xff, 0x00]).buffer),
  };
}

// Full, valid Classification (mock bypasses zod; category must be real so the
// real generateWorkOrder can index RULES without crashing).
function classification(
  overrides: Partial<Classification> = {},
): Classification {
  return {
    category: "pothole",
    subcategory: "deep edge crack",
    severity: 3,
    hazard_radius_m: 1.5,
    visible_size_estimate: "0.5m x 0.5m",
    is_emergency: false,
    confidence: 0.82,
    reasoning: "Visible pavement break with exposed depth.",
    no_issue_detected: false,
    alternate_categories: [],
    ...overrides,
  };
}

const REPORT_ID = "report-123";
const REPORT_ROW = { id: REPORT_ID, city_id: "city-9" };

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Tests -----------------------------------------------------------------
describe("runClassifyPipeline", () => {
  it("report-not-found -> ok:false and inserts an error_log row", async () => {
    const { client, tables } = makeSupabase({
      report: { data: null, error: { message: "no rows" } },
    });
    createServerClientMock.mockReturnValue(client as never);

    const result = await runClassifyPipeline(REPORT_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Report not found");
    }
    // error_log captured the failure.
    expect(tables.error_log.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "classify-pipeline",
        message: expect.stringContaining("Report not found"),
      }),
    );
    // Never reached Gemini or classification persistence.
    expect(classifyPhotoMock).not.toHaveBeenCalled();
    expect(tables.classifications.upsert).not.toHaveBeenCalled();
  });

  it("photo download fail -> neutral fallback classification still upserted (confidence 0, model_version fallback), Gemini skipped", async () => {
    const { client, tables, storage } = makeSupabase({
      report: { data: REPORT_ROW, error: null },
      download: { data: null, error: { message: "object not found" } },
      workOrder: {
        data: { id: "wo-1", report_id: REPORT_ID, priority_score: 7.5 },
        error: null,
      },
    });
    createServerClientMock.mockReturnValue(client as never);

    const result = await runClassifyPipeline(REPORT_ID);

    // Raw download was attempted from the photos-raw bucket.
    expect(storage.from).toHaveBeenCalledWith("photos-raw");
    expect(storage.download).toHaveBeenCalledWith(
      `${REPORT_ROW.city_id}/${REPORT_ID}.jpg`,
    );
    // Download failure -> Gemini skipped entirely.
    expect(classifyPhotoMock).not.toHaveBeenCalled();
    // Neutral fallback classification persisted.
    expect(tables.classifications.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        report_id: REPORT_ID,
        confidence: 0,
        model_version: "fallback",
        category: "other",
        raw_response: { fallback: true },
      }),
      { onConflict: "report_id" },
    );
    // Download failure logged to error_log.
    expect(tables.error_log.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Photo download failed"),
      }),
    );
    // Pipeline still proceeds to a work order (fallback category "other" -> not emergency).
    expect(tables.work_orders.upsert).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.emergency).toBe(false);
      expect(
        (result.data.classification as unknown as Record<string, unknown>)
          .model_version,
      ).toBeUndefined();
      expect(result.data.classification.category).toBe("other");
    }
  });

  it("gemini fail -> fallback persisted and pipeline continues to a work order", async () => {
    const { client, tables } = makeSupabase({
      report: { data: REPORT_ROW, error: null },
      download: { data: jpegBlob(), error: null },
      workOrder: {
        data: { id: "wo-2", report_id: REPORT_ID, priority_score: 9 },
        error: null,
      },
    });
    createServerClientMock.mockReturnValue(client as never);
    classifyPhotoMock.mockResolvedValue({ ok: false, error: "rate limited" });

    const result = await runClassifyPipeline(REPORT_ID);

    // Download succeeded -> Gemini WAS called with sniffed jpeg mime.
    expect(classifyPhotoMock).toHaveBeenCalledTimes(1);
    expect(classifyPhotoMock).toHaveBeenCalledWith(
      expect.any(String),
      "image/jpeg",
    );
    // Gemini failure persisted as fallback.
    expect(tables.classifications.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        report_id: REPORT_ID,
        confidence: 0,
        model_version: "fallback",
        category: "other",
      }),
      { onConflict: "report_id" },
    );
    // Gemini error captured.
    expect(tables.error_log.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "rate limited",
        metadata: expect.objectContaining({ stage: "gemini" }),
      }),
    );
    // Pipeline continues to a work order.
    expect(tables.work_orders.upsert).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it("gemini ok non-emergency -> classification persisted, work order inserted, status dispatched", async () => {
    const insertedWorkOrder = {
      id: "wo-3",
      report_id: REPORT_ID,
      department: "public_works",
      crew_type: "paving",
      priority_score: 7.5,
      est_minutes: 30,
      materials: ["cold patch", "tamper"],
    };
    const { client, tables } = makeSupabase({
      report: { data: REPORT_ROW, error: null },
      download: { data: jpegBlob(), error: null },
      workOrder: { data: insertedWorkOrder, error: null },
    });
    createServerClientMock.mockReturnValue(client as never);
    classifyPhotoMock.mockResolvedValue({
      ok: true,
      data: {
        classification: classification({
          category: "pothole",
          is_emergency: false,
        }),
        rawText: '{"category":"pothole"}',
      },
    });

    const result = await runClassifyPipeline(REPORT_ID);

    // Real classification (NOT fallback) persisted with model output preserved.
    expect(tables.classifications.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        report_id: REPORT_ID,
        category: "pothole",
        model_version: GEMINI_MODEL,
        raw_response: { text: '{"category":"pothole"}', mime: "image/jpeg" },
      }),
      { onConflict: "report_id" },
    );
    // Work order upserted (idempotent on report_id) with the deterministic rule
    // output for "pothole".
    expect(tables.work_orders.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        report_id: REPORT_ID,
        department: "public_works",
        crew_type: "paving",
        est_minutes: 30,
      }),
      { onConflict: "report_id" },
    );
    // Status transitioned to dispatched.
    expect(tables.reports.update).toHaveBeenCalledWith({
      status: "dispatched",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.emergency).toBe(false);
      expect(result.data.work_order).toEqual(insertedWorkOrder);
    }
  });

  it("emergency -> work order created (review gate bypassed), status dispatched", async () => {
    // Issue-8 behavior: emergencies no longer short-circuit — they get a work
    // order like any high-confidence report (so cost actuals can be captured
    // and the +50 priority term is live), and skip the manual-review hold.
    const insertedWorkOrder = {
      id: "wo-emergency",
      report_id: REPORT_ID,
      department: "utilities",
      crew_type: "line_crew",
      priority_score: 60,
      est_minutes: 120,
      materials: ["varies by severity"],
    };
    const { client, tables } = makeSupabase({
      report: { data: REPORT_ROW, error: null },
      download: { data: jpegBlob(), error: null },
      workOrder: { data: insertedWorkOrder, error: null },
    });
    createServerClientMock.mockReturnValue(client as never);
    classifyPhotoMock.mockResolvedValue({
      ok: true,
      data: {
        classification: classification({
          category: "water_leak",
          is_emergency: true,
          severity: 5,
        }),
        rawText: '{"category":"water_leak","is_emergency":true}',
      },
    });

    const result = await runClassifyPipeline(REPORT_ID);

    // Classification persisted.
    expect(tables.classifications.upsert).toHaveBeenCalled();
    // Work order created, never held for manual review.
    expect(tables.work_orders.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        report_id: REPORT_ID,
        department: "utilities",
        crew_type: "line_crew",
        needs_manual_review: false,
      }),
      { onConflict: "report_id" },
    );
    // Status transitioned to dispatched.
    expect(tables.reports.update).toHaveBeenCalledWith({
      status: "dispatched",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.emergency).toBe(true);
      expect(result.data.work_order).toEqual(insertedWorkOrder);
    }
  });

  it("duplicate detected -> records merge, marks merged, NO work order", async () => {
    const { client, tables } = makeSupabase({
      report: { data: REPORT_ROW, error: null },
      download: { data: jpegBlob(), error: null },
    });
    createServerClientMock.mockReturnValue(client as never);
    classifyPhotoMock.mockResolvedValue({
      ok: true,
      data: {
        classification: classification({
          category: "pothole",
          is_emergency: false,
        }),
        rawText: '{"category":"pothole"}',
      },
    });
    findDuplicateMock.mockResolvedValue({
      primaryReportId: "earlier-report-1",
      distanceM: 12.3,
      similarityScore: 0.75,
    });

    const result = await runClassifyPipeline(REPORT_ID);

    // Merge recorded with this report as the duplicate of the earlier primary.
    expect(tables.merges.insert).toHaveBeenCalledWith({
      primary_report_id: "earlier-report-1",
      duplicate_report_id: REPORT_ID,
      similarity_score: 0.75,
    });
    // Report marked merged, NOT dispatched.
    expect(tables.reports.update).toHaveBeenCalledWith({ status: "merged" });
    // Primary's work-order priority escalated (repeat report = demand signal).
    expect(client.rpc).toHaveBeenCalledWith("bump_work_order_priority", {
      _report_id: "earlier-report-1",
      _delta: 1,
    });
    // No work order created for a duplicate.
    expect(tables.work_orders.upsert).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.merged).toBe(true);
      expect(result.data.primary_report_id).toBe("earlier-report-1");
      expect(result.data.work_order).toBeNull();
    }
  });

  it("emergency duplicate is NEVER deduped -> dispatched, dedup skipped", async () => {
    const { client, tables } = makeSupabase({
      report: { data: REPORT_ROW, error: null },
      download: { data: jpegBlob(), error: null },
      // Emergencies create a work order (issue-8) before dispatching.
      workOrder: {
        data: {
          id: "wo-emergency-dup",
          report_id: REPORT_ID,
          department: "utilities",
          crew_type: "line_crew",
          priority_score: 60,
          est_minutes: 120,
          materials: ["varies by severity"],
        },
        error: null,
      },
    });
    createServerClientMock.mockReturnValue(client as never);
    classifyPhotoMock.mockResolvedValue({
      ok: true,
      data: {
        classification: classification({
          category: "water_leak",
          is_emergency: true,
          severity: 5,
        }),
        rawText: "{}",
      },
    });
    // Even if a dup existed, dedup is guarded on !is_emergency — an emergency
    // must never be merged away from auto-dispatch.
    findDuplicateMock.mockResolvedValue({
      primaryReportId: "earlier-report-1",
      distanceM: 5,
      similarityScore: 0.9,
    });

    const result = await runClassifyPipeline(REPORT_ID);

    expect(findDuplicateMock).not.toHaveBeenCalled();
    expect(tables.merges.insert).not.toHaveBeenCalled();
    expect(tables.reports.update).toHaveBeenCalledWith({
      status: "dispatched",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.emergency).toBe(true);
  });

  it("merge insert failure -> falls through to normal work order", async () => {
    const insertedWorkOrder = {
      id: "wo-merge-fallback",
      report_id: REPORT_ID,
      department: "public_works",
      crew_type: "paving",
      priority_score: 7.5,
      est_minutes: 30,
      materials: ["cold patch", "tamper"],
    };
    const { client, tables } = makeSupabase({
      report: { data: REPORT_ROW, error: null },
      download: { data: jpegBlob(), error: null },
      workOrder: { data: insertedWorkOrder, error: null },
      mergesWrite: { error: { message: "merges insert failed" } },
    });
    createServerClientMock.mockReturnValue(client as never);
    classifyPhotoMock.mockResolvedValue({
      ok: true,
      data: {
        classification: classification({ category: "pothole" }),
        rawText: "{}",
      },
    });
    findDuplicateMock.mockResolvedValue({
      primaryReportId: "earlier-report-1",
      distanceM: 10,
      similarityScore: 0.8,
    });

    const result = await runClassifyPipeline(REPORT_ID);

    // Could not record the merge -> NOT marked merged; normal WO path runs.
    expect(tables.reports.update).not.toHaveBeenCalledWith({
      status: "merged",
    });
    expect(tables.work_orders.upsert).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.merged).toBeUndefined();
  });
});
