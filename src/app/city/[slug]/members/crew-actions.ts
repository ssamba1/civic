"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import { getCityAdminContext } from "@/lib/staff-access";
import { isValidTeamId } from "@/lib/teams";

const log = createLogger("crew-actions");

export type CrewActionResult = { ok: true } | { ok: false; error: string };
export type CrewCreateResult =
  | { ok: true; crewId: string }
  | { ok: false; error: string };

// Crew labor types the AI pipeline emits (CrewType union in lib/types.ts).
// A crew may also carry no type — bespoke crews the AI doesn't know about.
const CREW_TYPE_VALUES = [
  "paving",
  "line_crew",
  "sign_crew",
  "cleanup",
  "concrete",
  "arborist",
  "drain_crew",
] as const;

const crewNameSchema = z.string().trim().min(1).max(80);
const crewTypeSchema = z.enum(CREW_TYPE_VALUES).nullable();
// Same guard as members/actions.ts teamKeySchema: a crew belongs to one real
// division, never the synthetic "all" view.
const teamKeySchema = z
  .string()
  .refine((t) => isValidTeamId(t) && t !== "all", "invalid_team");

const createSchema = z.object({
  slug: z.string().min(1),
  teamKey: teamKeySchema,
  name: crewNameSchema,
  crewType: crewTypeSchema,
});

const updateSchema = z.object({
  slug: z.string().min(1),
  crewId: z.string().min(1),
  name: crewNameSchema,
  crewType: crewTypeSchema,
  active: z.boolean(),
});

const deleteSchema = z.object({
  slug: z.string().min(1),
  crewId: z.string().min(1),
});

const setMembersSchema = z.object({
  slug: z.string().min(1),
  crewId: z.string().min(1),
  memberIds: z.array(z.string().min(1)).max(100),
  leadId: z.string().min(1).nullable(),
});

/** Resolve a crew and confirm it belongs to the admin's city — every mutation
 *  below must pass this before touching the row (a crew id from another city
 *  must behave exactly like a missing one). */
async function crewInCity(
  db: ReturnType<typeof createServerClient>,
  crewId: string,
  cityId: string,
): Promise<{ id: string; team_key: string } | null> {
  const { data, error } = await db
    .from("crews")
    .select("id, team_key, city_id")
    .eq("id", crewId)
    .maybeSingle();
  if (error) {
    log.error("crew lookup failed", error, { crewId });
    return null;
  }
  if (!data || data.city_id !== cityId) return null;
  return { id: data.id, team_key: data.team_key };
}

export interface CreateCrewInput {
  slug: string;
  teamKey: string;
  name: string;
  crewType: string | null;
}

/** Create a crew inside a division. Admin-gated. Returns the new crew id so
 *  the caller can set the roster in the same dialog flow. */
export async function createCrew(
  input: CreateCrewInput,
): Promise<CrewCreateResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { slug, teamKey, name, crewType } = parsed.data;

  const ctx = await getCityAdminContext(slug);
  if (!ctx) return { ok: false, error: "not_authorized" };

  const db = createServerClient();
  const { data, error } = await db
    .from("crews")
    .insert({
      city_id: ctx.cityId,
      team_key: teamKey,
      name,
      crew_type: crewType,
    })
    .select("id")
    .single();
  if (error || !data) {
    // 23505 = unique_violation on (city_id, team_key, name).
    if (error?.code === "23505") return { ok: false, error: "crew_name_taken" };
    log.error("crew insert failed", error ?? undefined, { slug });
    return { ok: false, error: "crew_create_failed" };
  }

  revalidatePath(`/city/${slug}/members`);
  return { ok: true, crewId: data.id };
}

export interface UpdateCrewInput {
  slug: string;
  crewId: string;
  name: string;
  crewType: string | null;
  active: boolean;
}

/** Rename / retype / (de)activate a crew. Admin-gated. */
export async function updateCrew(
  input: UpdateCrewInput,
): Promise<CrewActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { slug, crewId, name, crewType, active } = parsed.data;

  const ctx = await getCityAdminContext(slug);
  if (!ctx) return { ok: false, error: "not_authorized" };

  const db = createServerClient();
  if (!(await crewInCity(db, crewId, ctx.cityId)))
    return { ok: false, error: "crew_not_found" };

  const { error } = await db
    .from("crews")
    .update({ name, crew_type: crewType, active })
    .eq("id", crewId);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "crew_name_taken" };
    log.error("crew update failed", error, { slug, crewId });
    return { ok: false, error: "crew_update_failed" };
  }

  revalidatePath(`/city/${slug}/members`);
  return { ok: true };
}

/** Delete a crew. Memberships cascade; work orders keep history via
 *  ON DELETE SET NULL on assigned_crew_id. Admin-gated. */
export async function deleteCrew(input: {
  slug: string;
  crewId: string;
}): Promise<CrewActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { slug, crewId } = parsed.data;

  const ctx = await getCityAdminContext(slug);
  if (!ctx) return { ok: false, error: "not_authorized" };

  const db = createServerClient();
  if (!(await crewInCity(db, crewId, ctx.cityId)))
    return { ok: false, error: "crew_not_found" };

  const { error } = await db.from("crews").delete().eq("id", crewId);
  if (error) {
    log.error("crew delete failed", error, { slug, crewId });
    return { ok: false, error: "crew_delete_failed" };
  }

  revalidatePath(`/city/${slug}/members`);
  return { ok: true };
}

export interface SetCrewMembersInput {
  slug: string;
  crewId: string;
  memberIds: string[];
  leadId: string | null;
}

/**
 * Replace a crew's roster. Admin-gated. Every member must belong to the
 * admin's city; the lead (if any) must be in the new roster. Replace-set
 * (delete + insert) — crew rosters are small and the operation is idempotent,
 * so partial-failure recovery is "submit again".
 */
export async function setCrewMembers(
  input: SetCrewMembersInput,
): Promise<CrewActionResult> {
  const parsed = setMembersSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { slug, crewId, leadId } = parsed.data;
  const memberIds = [...new Set(parsed.data.memberIds)];

  if (leadId && !memberIds.includes(leadId))
    return { ok: false, error: "lead_not_on_crew" };

  const ctx = await getCityAdminContext(slug);
  if (!ctx) return { ok: false, error: "not_authorized" };

  const db = createServerClient();
  if (!(await crewInCity(db, crewId, ctx.cityId)))
    return { ok: false, error: "crew_not_found" };

  // Everyone on the roster must be a member of this city.
  if (memberIds.length > 0) {
    const { data, error } = await db
      .from("users")
      .select("id")
      .in("id", memberIds)
      .eq("city_id", ctx.cityId);
    if (error) {
      log.error("crew member validation failed", error, { slug, crewId });
      return { ok: false, error: "crew_members_failed" };
    }
    if ((data ?? []).length !== memberIds.length)
      return { ok: false, error: "member_not_in_city" };
  }

  const { error: delErr } = await db
    .from("crew_members")
    .delete()
    .eq("crew_id", crewId);
  if (delErr) {
    log.error("crew members clear failed", delErr, { slug, crewId });
    return { ok: false, error: "crew_members_failed" };
  }

  if (memberIds.length > 0) {
    const { error: insErr } = await db.from("crew_members").insert(
      memberIds.map((userId) => ({
        crew_id: crewId,
        user_id: userId,
        is_lead: userId === leadId,
      })),
    );
    if (insErr) {
      log.error("crew members insert failed", insErr, { slug, crewId });
      return { ok: false, error: "crew_members_failed" };
    }
  }

  revalidatePath(`/city/${slug}/members`);
  return { ok: true };
}
