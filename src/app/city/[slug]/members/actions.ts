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
export type InviteMemberResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

// Same shape as onboard/actions.ts EMAIL_RE, one local address, one dotted host.
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
// pseudo-team, never an assignment, so it is rejected, mirrors the
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

// Crews the member sits on (ids into this city's crews table, validated
// against the DB in syncMemberCrews, not here).
const crewIdsSchema = z.array(z.string().min(1)).max(20).default([]);

const inviteSchema = z.object({
  slug: z.string().min(1),
  email: z.string().regex(EMAIL_RE, "invalid_email"),
  displayName: displayNameSchema,
  role: roleSchema,
  teamKey: teamKeySchema,
  phone: phoneSchema,
  crewIds: crewIdsSchema,
});

const updateSchema = z.object({
  slug: z.string().min(1),
  userId: z.string().min(1),
  displayName: displayNameSchema,
  role: roleSchema,
  teamKey: teamKeySchema,
  phone: phoneSchema,
  crewIds: crewIdsSchema,
});

/**
 * Replace `userId`'s crew memberships across ALL of `cityId`'s crews with
 * `crewIds` (which must belong to this city AND to the member's division).
 * is_lead survives for retained crews. Leads are managed in the crews panel,
 * so a profile edit must not silently demote one. Returns an error code or
 * null on success.
 *
 * Pre-migration-030 tolerance: when the crews tables don't exist yet and no
 * crews were requested, this is a logged no-op so member management keeps
 * working until the migration is applied.
 */
async function syncMemberCrews(
  db: ReturnType<typeof createServerClient>,
  cityId: string,
  userId: string,
  teamKey: string | null,
  crewIds: string[],
): Promise<string | null> {
  const requested = [...new Set(crewIds)];

  const { data: crewData, error: crewErr } = await db
    .from("crews")
    .select("id, team_key")
    .eq("city_id", cityId);
  if (crewErr) {
    if (requested.length === 0) {
      log.error("crews lookup failed (no-op, none requested)", crewErr, {
        cityId,
      });
      return null;
    }
    log.error("crews lookup failed", crewErr, { cityId });
    return "crew_sync_failed";
  }
  const cityCrews = (crewData ?? []) as { id: string; team_key: string }[];
  const cityCrewIds = cityCrews.map((c) => c.id);
  const byId = new Map(cityCrews.map((c) => [c.id, c]));

  for (const id of requested) {
    const crew = byId.get(id);
    if (!crew) return "invalid_crew";
    // A crew assignment only makes sense inside the member's own division.
    if (teamKey === null || crew.team_key !== teamKey)
      return "crew_team_mismatch";
  }

  if (cityCrewIds.length === 0) return null;

  // Preserve is_lead on retained memberships across the replace-set.
  const { data: existingData, error: existingErr } = await db
    .from("crew_members")
    .select("crew_id, is_lead")
    .eq("user_id", userId)
    .in("crew_id", cityCrewIds);
  if (existingErr) {
    log.error("existing crew memberships lookup failed", existingErr, {
      cityId,
      userId,
    });
    return "crew_sync_failed";
  }
  const wasLead = new Map(
    ((existingData ?? []) as { crew_id: string; is_lead: boolean }[]).map(
      (m) => [m.crew_id, m.is_lead],
    ),
  );

  const { error: delErr } = await db
    .from("crew_members")
    .delete()
    .eq("user_id", userId)
    .in("crew_id", cityCrewIds);
  if (delErr) {
    log.error("crew memberships clear failed", delErr, { cityId, userId });
    return "crew_sync_failed";
  }

  if (requested.length > 0) {
    const { error: insErr } = await db.from("crew_members").insert(
      requested.map((crewId) => ({
        crew_id: crewId,
        user_id: userId,
        is_lead: wasLead.get(crewId) ?? false,
      })),
    );
    if (insErr) {
      log.error("crew memberships insert failed", insErr, { cityId, userId });
      return "crew_sync_failed";
    }
  }

  return null;
}

export interface InviteMemberInput {
  slug: string;
  email: string;
  displayName: string;
  role: MemberRole;
  teamKey: string | null;
  phone: string | null;
  crewIds: string[];
}

/**
 * Invite a new member to the city owning `input.slug`. Admin-gated. Sends the
 * Supabase invite email, then upserts the profile row; a row failure rolls the
 * auth user back so the email is freed for retry, mirrors onboard/actions.ts.
 */
export async function inviteMember(
  input: InviteMemberInput,
): Promise<InviteMemberResult> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { slug, displayName, role, teamKey, phone, crewIds } = parsed.data;
  const email = parsed.data.email.toLowerCase(); // normalize before invite + row

  const ctx = await getCityAdminContext(slug);
  if (!ctx) return { ok: false, error: "not_authorized" };

  const db = createServerClient();

  const { data: invited, error: inviteErr } =
    await db.auth.admin.inviteUserByEmail(email);
  if (inviteErr) {
    // Supabase reports an existing account as an "already registered" auth
    // error, surface it as a machine-readable membership code for the UI.
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

  // The member exists either way, a crew-sync failure surfaces as an error
  // the admin can fix from Edit member, not a rollback of the invite.
  const crewErr = await syncMemberCrews(
    db,
    ctx.cityId,
    userId,
    teamKey,
    crewIds,
  );
  if (crewErr) {
    revalidatePath(`/city/${slug}/members`);
    return { ok: false, error: crewErr };
  }

  revalidatePath(`/city/${slug}/members`);
  return { ok: true, userId };
}

export interface UpdateMemberInput {
  slug: string;
  userId: string;
  displayName: string;
  role: MemberRole;
  teamKey: string | null;
  phone: string | null;
  crewIds: string[];
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
  const { slug, userId, displayName, role, teamKey, phone, crewIds } =
    parsed.data;

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

  const crewErr = await syncMemberCrews(
    db,
    ctx.cityId,
    userId,
    teamKey,
    crewIds,
  );
  if (crewErr) {
    revalidatePath(`/city/${slug}/members`);
    return { ok: false, error: crewErr };
  }

  revalidatePath(`/city/${slug}/members`);
  revalidatePath(`/city/${slug}/members/${userId}`);
  return { ok: true };
}
