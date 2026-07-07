"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import { getCityAdminContext } from "@/lib/staff-access";
import { isValidTeamId } from "@/lib/teams";

const log = createLogger("members-actions");

export type MemberRole =
  | "resident"
  | "staff_dispatcher"
  | "staff_supervisor"
  | "admin";
export type MemberActionResult = { ok: true } | { ok: false; error: string };

// Same shape as onboard/actions.ts EMAIL_RE — one local address, one dotted host.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const ROLE_VALUES = [
  "resident",
  "staff_dispatcher",
  "staff_supervisor",
  "admin",
] as const;

const roleSchema = z.enum(ROLE_VALUES);
const displayNameSchema = z.string().trim().min(1).max(120);

// A person's team assignment is a single real team. "all" is the admin *view*
// pseudo-team, never an assignment, so it is rejected — mirrors the
// isValidTeamId(t) && t !== "all" guard used across schemas.ts.
const teamKeySchema = z
  .string()
  .refine((t) => isValidTeamId(t) && t !== "all", "invalid_team")
  .nullable();

// Optional contact number: trim, cap at 32 chars, and fold empty → null so a
// blank field never persists as "".
const phoneSchema = z
  .string()
  .trim()
  .max(32)
  .nullable()
  .transform((v) => (v ? v : null));

const inviteSchema = z.object({
  slug: z.string().min(1),
  email: z.string().regex(EMAIL_RE, "invalid_email"),
  displayName: displayNameSchema,
  role: roleSchema,
  teamKey: teamKeySchema,
  phone: phoneSchema,
});

const updateSchema = z.object({
  slug: z.string().min(1),
  userId: z.string().min(1),
  displayName: displayNameSchema,
  role: roleSchema,
  teamKey: teamKeySchema,
  phone: phoneSchema,
});

export interface InviteMemberInput {
  slug: string;
  email: string;
  displayName: string;
  role: MemberRole;
  teamKey: string | null;
  phone: string | null;
}

/**
 * Invite a new member to the city owning `input.slug`. Admin-gated. Sends the
 * Supabase invite email, then upserts the profile row; a row failure rolls the
 * auth user back so the email is freed for retry — mirrors onboard/actions.ts.
 */
export async function inviteMember(
  input: InviteMemberInput,
): Promise<MemberActionResult> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { slug, displayName, role, teamKey, phone } = parsed.data;
  const email = parsed.data.email.toLowerCase(); // normalize before invite + row

  const ctx = await getCityAdminContext(slug);
  if (!ctx) return { ok: false, error: "not_authorized" };

  const db = createServerClient();

  const { data: invited, error: inviteErr } =
    await db.auth.admin.inviteUserByEmail(email);
  if (inviteErr) {
    // Supabase reports an existing account as an "already registered" auth
    // error — surface it as a machine-readable membership code for the UI.
    if (/already.*regist/i.test(inviteErr.message))
      return { ok: false, error: "email_already_member" };
    log.error("inviteUserByEmail failed", inviteErr, { slug });
    return { ok: false, error: "invite_failed" };
  }
  const userId = invited.user?.id ?? null;
  if (!userId) {
    log.error("invite returned no user id", undefined, { slug });
    return { ok: false, error: "invite_failed" };
  }

  const { error: rowErr } = await db.from("users").upsert(
    {
      id: userId,
      city_id: ctx.cityId,
      role,
      email,
      display_name: displayName,
      team_key: teamKey,
      phone,
      is_shared: false,
    },
    { onConflict: "id" },
  );
  if (rowErr) {
    // Compensate: delete the orphaned auth user so the email is freed and the
    // invite can be retried (otherwise it's a poison-pill retry).
    await db.auth.admin.deleteUser(userId);
    log.error("member row upsert failed (rolled back)", rowErr, { slug });
    return { ok: false, error: "member_row_failed" };
  }

  revalidatePath(`/city/${slug}/members`);
  return { ok: true };
}

export interface UpdateMemberInput {
  slug: string;
  userId: string;
  displayName: string;
  role: MemberRole;
  teamKey: string | null;
  phone: string | null;
}

/**
 * Update an existing member's profile in the city owning `input.slug`.
 * Admin-gated. The target must belong to the admin's city, and a real admin
 * cannot change their own role (demoting the acting admin can lock the city
 * out of its console).
 */
export async function updateMember(
  input: UpdateMemberInput,
): Promise<MemberActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { slug, userId, displayName, role, teamKey, phone } = parsed.data;

  const ctx = await getCityAdminContext(slug);
  if (!ctx) return { ok: false, error: "not_authorized" };

  const db = createServerClient();

  const { data: target, error: targetErr } = await db
    .from("users")
    .select("city_id, role")
    .eq("id", userId)
    .maybeSingle();
  if (targetErr) {
    log.error("target member lookup failed", targetErr, { slug });
    return { ok: false, error: "member_lookup_failed" };
  }
  if (!target || target.city_id !== ctx.cityId)
    return { ok: false, error: "member_not_found" };

  // Real admin (userId set) editing their own row may not change their role;
  // the dev bypass (empty ctx.userId) has no identity, so it skips this.
  if (ctx.userId !== "" && userId === ctx.userId && role !== target.role)
    return { ok: false, error: "cannot_change_own_role" };

  const { error: updateErr } = await db
    .from("users")
    .update({
      display_name: displayName,
      role,
      team_key: teamKey,
      phone,
    })
    .eq("id", userId);
  if (updateErr) {
    log.error("member update failed", updateErr, { slug });
    return { ok: false, error: "member_update_failed" };
  }

  revalidatePath(`/city/${slug}/members`);
  revalidatePath(`/city/${slug}/members/${userId}`);
  return { ok: true };
}
