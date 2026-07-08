"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { CREW_TYPE_KEY_PATTERN } from "@/lib/crew-types";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import { getCityAdminContext } from "@/lib/staff-access";
import { isValidTeamId } from "@/lib/teams";

const log = createLogger("crew-actions");

export type CrewActionResult = { ok: true } | { ok: false; error: string };
export type CrewCreateResult =
  | { ok: true; crewId: string }
  | { ok: false; error: string };

const crewNameSchema = z.string().trim().min(1).max(80);
// A crew-type is a key into the city's crew_types catalog (031) or one of the
// app defaults. Validated by shape (the same CHECK the column enforces), not
// by membership — the select UI constrains the choices, and a key whose
// catalog row was later deleted must stay editable rather than brick the form.
const crewTypeSchema = z
  .string()
  .regex(CREW_TYPE_KEY_PATTERN, "invalid_crew_type")
  .nullable();
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

/* ==================================================================
   Crew types (migration 031) — the per-city catalog of labor types.
   The description feeds the work-order AI's crew_type pick, so these
   actions are how a city teaches the AI what its crews can do.
   ================================================================== */

const crewTypeKeySchema = z
  .string()
  .regex(CREW_TYPE_KEY_PATTERN, "invalid_key");

const saveCrewTypeSchema = z.object({
  slug: z.string().min(1),
  // null = create; a uuid = update (key is immutable after creation — crews
  // and work orders reference it softly, renaming would orphan them).
  id: z.string().min(1).nullable(),
  key: crewTypeKeySchema,
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500),
  active: z.boolean(),
});

const deleteCrewTypeSchema = z.object({
  slug: z.string().min(1),
  id: z.string().min(1),
});

/** Resolve a crew_types row and confirm it belongs to the admin's city —
 *  mirror of crewInCity: a foreign id must behave like a missing one. */
async function crewTypeInCity(
  db: ReturnType<typeof createServerClient>,
  id: string,
  cityId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("crew_types")
    .select("id, city_id")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    log.error("crew type lookup failed", error, { id });
    return false;
  }
  return Boolean(data && data.city_id === cityId);
}

export interface SaveCrewTypeInput {
  slug: string;
  id: string | null;
  key: string;
  label: string;
  description: string;
  active: boolean;
}

/** Create or update a crew type. Admin-gated. On update the key is left
 *  untouched (immutable) — only label/description/active change. */
export async function saveCrewType(
  input: SaveCrewTypeInput,
): Promise<CrewActionResult> {
  const parsed = saveCrewTypeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { slug, id, key, label, description, active } = parsed.data;

  const ctx = await getCityAdminContext(slug);
  if (!ctx) return { ok: false, error: "not_authorized" };

  const db = createServerClient();
  if (id === null) {
    const { error } = await db.from("crew_types").insert({
      city_id: ctx.cityId,
      key,
      label,
      description,
      active,
    });
    if (error) {
      // 23505 = unique_violation on (city_id, key).
      if (error.code === "23505")
        return { ok: false, error: "crew_type_key_taken" };
      log.error("crew type insert failed", error, { slug, key });
      return { ok: false, error: "crew_type_save_failed" };
    }
  } else {
    if (!(await crewTypeInCity(db, id, ctx.cityId)))
      return { ok: false, error: "crew_type_not_found" };
    const { error } = await db
      .from("crew_types")
      .update({ label, description, active })
      .eq("id", id);
    if (error) {
      log.error("crew type update failed", error, { slug, id });
      return { ok: false, error: "crew_type_save_failed" };
    }
  }

  revalidatePath(`/city/${slug}/members`);
  return { ok: true };
}

/** Delete a crew type. Crews referencing the key keep it (soft reference —
 *  the UI shows the raw key); the AI simply stops offering it. Admin-gated. */
export async function deleteCrewType(input: {
  slug: string;
  id: string;
}): Promise<CrewActionResult> {
  const parsed = deleteCrewTypeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { slug, id } = parsed.data;

  const ctx = await getCityAdminContext(slug);
  if (!ctx) return { ok: false, error: "not_authorized" };

  const db = createServerClient();
  if (!(await crewTypeInCity(db, id, ctx.cityId)))
    return { ok: false, error: "crew_type_not_found" };

  const { error } = await db.from("crew_types").delete().eq("id", id);
  if (error) {
    log.error("crew type delete failed", error, { slug, id });
    return { ok: false, error: "crew_type_delete_failed" };
  }

  revalidatePath(`/city/${slug}/members`);
  return { ok: true };
}
