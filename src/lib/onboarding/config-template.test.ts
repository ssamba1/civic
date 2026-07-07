// @vitest-environment node
import { applyConfigTemplate } from "./config-template";

function makeDb(failTable?: string) {
  const upserts: Record<
    string,
    { rows: Record<string, unknown>[]; onConflict: string }
  > = {};
  const from = vi.fn((table: string) => ({
    upsert: vi.fn(
      async (rows: Record<string, unknown>[], opts: { onConflict: string }) => {
        if (table === failTable) return { error: { message: "boom" } };
        upserts[table] = { rows, onConflict: opts.onConflict };
        return { error: null };
      },
    ),
  }));
  // biome-ignore lint/suspicious/noExplicitAny: structural supabase stub
  return { db: { from } as any, upserts };
}

describe("applyConfigTemplate", () => {
  it("seeds all four config tables with sane shapes", async () => {
    const { db, upserts } = makeDb();
    const res = await applyConfigTemplate(db, "city-1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // 11 departments (TEAMS minus the "all" pseudo-team), 12 categories.
    expect(res.data.departments).toBe(11);
    expect(res.data.routing).toBe(12);
    expect(res.data.sla).toBe(12);
    expect(res.data.cost).toBe(12);

    expect(upserts.city_departments.onConflict).toBe("city_id,team_id");
    expect(upserts.category_routing.onConflict).toBe("city_id,category");

    const dept = upserts.city_departments.rows[0];
    expect(dept).toMatchObject({ city_id: "city-1", active: true });
    expect(dept.team_id).toBeTruthy();
    expect(dept.label).toBeTruthy();

    const sla = upserts.sla_targets.rows.find((r) => r.category === "pothole");
    expect(sla?.hours).toBe(72); // CATEGORY_SLA_TARGETS.pothole

    const cost = upserts.cost_rules.rows.find((r) => r.category === "pothole");
    // pothole floor: 75*(30/60)+60 = 97.5 → 98
    expect(cost?.est_cost).toBe(98);
  });

  it("returns an error when a table upsert fails", async () => {
    const { db } = makeDb("sla_targets");
    const res = await applyConfigTemplate(db, "city-1");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/^CONFIG_SLA_TARGETS/);
  });
});
