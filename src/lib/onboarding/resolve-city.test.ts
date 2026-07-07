// @vitest-environment node
import { resolveCityForPoint } from "./resolve-city";

function makeDb(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn(async () => result);
  // biome-ignore lint/suspicious/noExplicitAny: structural supabase stub
  return { db: { rpc } as any, rpc };
}

describe("resolveCityForPoint", () => {
  it("returns the city id the RPC resolves", async () => {
    const { db, rpc } = makeDb({ data: "city-uuid", error: null });
    const id = await resolveCityForPoint(db, -84.13, 34.2);
    expect(id).toBe("city-uuid");
    expect(rpc).toHaveBeenCalledWith("city_for_point", {
      _lng: -84.13,
      _lat: 34.2,
    });
  });

  it("returns null when no boundary contains the point", async () => {
    const { db } = makeDb({ data: null, error: null });
    expect(await resolveCityForPoint(db, 0, 0)).toBeNull();
  });

  it("returns null on RPC error (e.g. un-migrated DB)", async () => {
    const { db } = makeDb({ data: null, error: { message: "no function" } });
    expect(await resolveCityForPoint(db, -84.13, 34.2)).toBeNull();
  });
});
