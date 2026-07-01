export type ChatRole =
  | "anon"
  | "resident"
  | "staff_dispatcher"
  | "staff_supervisor"
  | "admin";

export interface ChatScope {
  userId: string | null;
  role: ChatRole;
  citySlug: string | null;
}

/** Shape of the joined users+cities row (RLS-scoped read). */
export interface UserRow {
  id: string;
  role: ChatRole;
  cities: { slug: string } | null;
}

const STAFF: ChatRole[] = ["staff_dispatcher", "staff_supervisor", "admin"];

export function isStaffRole(role: ChatRole): boolean {
  return STAFF.includes(role);
}

/** Pure mapping from a fetched user row (or null) to a ChatScope. */
export function deriveScope(row: UserRow | null): ChatScope {
  if (!row) return { userId: null, role: "anon", citySlug: null };
  return {
    userId: row.id,
    role: row.role,
    citySlug: row.cities?.slug ?? null,
  };
}
