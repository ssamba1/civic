import { describe, expect, it, vi } from "vitest";
import { CATEGORY_SLA_TARGETS } from "@/lib/dashboard-data";
import { fetchSlaHours } from "./sla-targets";

// Minimal stub of the supabase query chain: .from().select().eq().eq().maybeSingle()
function stubClient(result: { data: unknown; error: unknown }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve(result),
  };
  // biome-ignore lint/suspicious/noExplicitAny: test stub for the supabase client
  return { from: vi.fn(() => chain) } as any;
}

describe("fetchSlaHours", () => {
  it("returns the city's sla_targets hours when present", async () => {
    const db = stubClient({ data: { hours: 12 }, error: null });
    expect(await fetchSlaHours(db, "city-1", "pothole")).toBe(12);
  });

  it("falls back to the static map when the city has no row", async () => {
    const db = stubClient({ data: null, error: null });
    expect(await fetchSlaHours(db, "city-1", "pothole")).toBe(
      CATEGORY_SLA_TARGETS.pothole,
    );
  });

  it("falls back on a DB error (un-migrated table)", async () => {
    const db = stubClient({ data: null, error: { message: "no such table" } });
    expect(await fetchSlaHours(db, "city-1", "water_leak")).toBe(
      CATEGORY_SLA_TARGETS.water_leak,
    );
  });

  it("falls back when there is no cityId", async () => {
    const db = stubClient({ data: { hours: 999 }, error: null });
    expect(await fetchSlaHours(db, null, "graffiti")).toBe(
      CATEGORY_SLA_TARGETS.graffiti,
    );
  });

  it("rejects a non-positive hours value and falls back", async () => {
    const db = stubClient({ data: { hours: 0 }, error: null });
    expect(await fetchSlaHours(db, "city-1", "debris")).toBe(
      CATEGORY_SLA_TARGETS.debris,
    );
  });
});
