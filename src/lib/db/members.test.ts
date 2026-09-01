import { beforeEach, describe, expect, it, vi } from "vitest";

// Per-table list responses (awaited) + single responses (maybeSingle) + a
// stubbable auth admin. fetchCrewIdsByUser shares this client (crews table).
let list: Record<string, { data: unknown; error: unknown }>;
let single: Record<string, { data: unknown; error: unknown }>;
let authUsers: Array<{ id: string; last_sign_in_at: string | null }>;

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "in", "limit"]) b[m] = () => b;
  b.maybeSingle = () =>
    Promise.resolve(single[table] ?? { data: null, error: null });
  // biome-ignore lint/suspicious/noThenProperty: intentional thenable mock of the supabase query builder
  b.then = (resolve: (v: unknown) => unknown) =>
    resolve(list[table] ?? { data: [], error: null });
  return b;
}
const from = vi.fn((t: string) => makeBuilder(t));
const client = {
  from,
  auth: {
    admin: {
      listUsers: vi.fn(() =>
        Promise.resolve({ data: { users: authUsers }, error: null }),
      ),
      getUserById: vi.fn((id: string) =>
        Promise.resolve({
          data: { user: authUsers.find((u) => u.id === id) ?? null },
          error: null,
        }),
      ),
    },
  },
};
vi.mock("@/lib/db/client", () => ({ createServerClient: () => client }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import {
  fetchCityMembers,
  fetchMemberDetail,
  maskEmail,
  maskPhone,
} from "./members";

beforeEach(() => {
  list = {};
  single = {};
  authUsers = [];
  from.mockClear();
});

describe("maskEmail (PII contract, demo sessions never see raw)", () => {
  it("masks local part and host, keeps first chars + tld", () => {
    expect(maskEmail("jane.doe@city.gov")).toBe("j•••@c•••.gov");
  });
  it("handles no-dot domains and null/garbage", () => {
    expect(maskEmail("a@localhost")).toBe("a•••@l•••");
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail("nope")).toBe("•••");
  });
});

describe("maskPhone", () => {
  it("keeps only the last two digits", () => {
    expect(maskPhone("+1 470 555 0142")).toBe("•••••42");
    expect(maskPhone(null)).toBeNull();
  });
});

describe("fetchCityMembers", () => {
  it("assembles rows, sorts admin→staff→resident then by name, rolls up reports", async () => {
    list.users = {
      data: [
        {
          id: "u3",
          display_name: "Rita Resident",
          role: "resident",
          team_key: null,
          is_shared: false,
          email: null,
          phone: null,
          created_at: "2026-01-01",
        },
        {
          id: "u1",
          display_name: "Amy Admin",
          role: "admin",
          team_key: null,
          is_shared: false,
          email: null,
          phone: null,
          created_at: "2026-01-01",
        },
        {
          id: "u2",
          display_name: "Sam Staff",
          role: "staff_dispatcher",
          team_key: "t",
          is_shared: false,
          email: null,
          phone: null,
          created_at: "2026-01-01",
        },
      ],
      error: null,
    };
    list.reports = {
      data: [
        { reporter_id: "u3", created_at: "2026-06-01T00:00:00Z" },
        { reporter_id: "u3", created_at: "2026-06-05T00:00:00Z" },
      ],
      error: null,
    };
    const r = await fetchCityMembers("c1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.members.map((m) => m.id)).toEqual(["u1", "u2", "u3"]); // role rank
      const rita = r.members.find((m) => m.id === "u3");
      expect(rita?.reportCount).toBe(2);
      expect(rita?.lastActiveAt).toBe("2026-06-05T00:00:00Z");
    }
  });

  it("returns [] when the city has no users", async () => {
    list.users = { data: [], error: null };
    expect(await fetchCityMembers("c1")).toEqual({ ok: true, members: [] });
  });

  it("returns a tagged failure when the users query errors", async () => {
    list.users = { data: null, error: { message: "boom" } };
    expect(await fetchCityMembers("c1")).toEqual({
      ok: false,
      error: "members_query_failed",
    });
  });
});

describe("fetchMemberDetail", () => {
  it("refuses a member from another city (id+city both enforced → not_found)", async () => {
    single.users = { data: null, error: null };
    expect(await fetchMemberDetail("c1", "foreign")).toEqual({
      ok: false,
      error: "member_not_found",
    });
  });

  it("rolls up statusCounts over full history and returns the member", async () => {
    single.users = {
      data: {
        id: "u1",
        display_name: "Amy",
        role: "resident",
        team_key: null,
        is_shared: false,
        email: null,
        phone: null,
        created_at: "2026-01-01",
      },
      error: null,
    };
    list.reports = {
      data: [
        {
          id: "r1",
          status: "open",
          address: null,
          created_at: "2026-06-02",
          classifications: { category: "pothole" },
        },
        {
          id: "r2",
          status: "closed",
          address: null,
          created_at: "2026-06-01",
          classifications: null,
        },
      ],
      error: null,
    };
    const r = await fetchMemberDetail("c1", "u1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.detail.statusCounts).toEqual({ open: 1, closed: 1 });
      expect(r.detail.reports[0].category).toBe("pothole");
      expect(r.detail.reports[1].category).toBeNull();
      expect(r.detail.member.reportCount).toBe(2);
    }
  });
});
