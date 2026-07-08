import { describe, expect, it, vi } from "vitest";
import { resolveOwningCity } from "./jurisdiction";

function client(rpc: () => Promise<{ data: unknown; error: unknown }>) {
  // biome-ignore lint/suspicious/noExplicitAny: minimal supabase stub for the test
  return { rpc: vi.fn(rpc) } as any;
}

describe("resolveOwningCity", () => {
  it("returns the RPC's owning city when it resolves", async () => {
    const db = client(() =>
      Promise.resolve({ data: "parent-city", error: null }),
    );
    expect(await resolveOwningCity(db, "r1", "own-city")).toBe("parent-city");
  });

  it("falls back to the report's own city on RPC error (un-migrated)", async () => {
    const db = client(() =>
      Promise.resolve({ data: null, error: { message: "no function" } }),
    );
    expect(await resolveOwningCity(db, "r1", "own-city")).toBe("own-city");
  });

  it("falls back on a non-string / empty result", async () => {
    const db = client(() => Promise.resolve({ data: null, error: null }));
    expect(await resolveOwningCity(db, "r1", "own-city")).toBe("own-city");
  });

  it("falls back when the RPC throws", async () => {
    const db = client(() => Promise.reject(new Error("network")));
    expect(await resolveOwningCity(db, "r1", "own-city")).toBe("own-city");
  });
});
