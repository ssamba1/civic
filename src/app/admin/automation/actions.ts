"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireAdminScope } from "@/lib/auth/admin-scope";
import type { Action, AutomationRule, Condition } from "@/lib/automation/rules";
import { validateRule } from "@/lib/automation/rules";
import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { DEMO_SESSION_COOKIE, findDemoAccount } from "@/lib/demo-auth";
import { DEMO_MODE } from "@/lib/demo-mode";
import { createLogger } from "@/lib/logger";
import type { Result } from "@/lib/types";

const log = createLogger("admin-automation-actions");

// ---------------------------------------------------------------------------
// Admin guard — mirrors pattern from admin/webhooks/actions.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public row type
// ---------------------------------------------------------------------------
export type AutomationRuleRow = AutomationRule;

// ---------------------------------------------------------------------------
// listRulesAction
// ---------------------------------------------------------------------------
export async function listRulesAction(
  cityId: string,
): Promise<Result<AutomationRuleRow[]>> {
  const admin = await requireAdminScope();
  if (!admin) return { ok: false, error: "unauthorized" };

  // Ignore the caller-supplied cityId — an admin only ever sees their own city.
  const parsedCityId = z.string().uuid().safeParse(admin.cityId);
  if (!parsedCityId.success) return { ok: false, error: "invalid_id" };

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("automation_rules")
      .select("*")
      .eq("city_id", parsedCityId.data)
      .order("priority", { ascending: true });

    if (error) {
      log.error("listRulesAction query failed", error, { cityId });
      return { ok: false, error: "db_error" };
    }
    return { ok: true, data: (data ?? []) as AutomationRuleRow[] };
  } catch (err) {
    // Graceful degrade if table doesn't exist yet
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("relation") && msg.includes("does not exist")) {
      return { ok: true, data: [] };
    }
    log.error("listRulesAction threw", err, { cityId });
    return { ok: false, error: "db_error" };
  }
}

// ---------------------------------------------------------------------------
// createRuleAction
// ---------------------------------------------------------------------------
export async function createRuleAction(input: {
  cityId: string;
  name: string;
  priority?: number;
  conditions: Condition[];
  actions: Action[];
}): Promise<Result<{ id: string }>> {
  const admin = await requireAdminScope();
  if (!admin) return { ok: false, error: "unauthorized" };

  // Ignore input.cityId — an admin only ever writes rules for their own city.
  const parsedCityId = z.string().uuid().safeParse(admin.cityId);
  if (!parsedCityId.success) return { ok: false, error: "invalid_id" };

  const validation = validateRule({
    name: input.name,
    conditions: input.conditions,
    actions: input.actions,
  });
  if (!validation.ok) return { ok: false, error: validation.error };

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("automation_rules")
      .insert({
        city_id: parsedCityId.data,
        name: input.name.trim(),
        priority: input.priority ?? 0,
        conditions: input.conditions,
        actions: input.actions,
        enabled: true,
      })
      .select("id")
      .single();

    if (error || !data) {
      if (error)
        log.error("createRuleAction insert failed", error, {
          cityId: input.cityId,
        });
      return { ok: false, error: "db_error" };
    }

    revalidatePath("/admin/automation");
    return { ok: true, data: { id: data.id as string } };
  } catch (err) {
    log.error("createRuleAction threw", err, { cityId: input.cityId });
    return { ok: false, error: "db_error" };
  }
}

// ---------------------------------------------------------------------------
// updateRuleAction
// ---------------------------------------------------------------------------
export async function updateRuleAction(
  id: string,
  input: Partial<{
    name: string;
    priority: number;
    enabled: boolean;
    conditions: Condition[];
    actions: Action[];
  }>,
): Promise<Result<void>> {
  const admin = await requireAdminScope();
  if (!admin) return { ok: false, error: "unauthorized" };

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "invalid_id" };

  // Validate if conditions/actions are being updated
  if (input.conditions !== undefined || input.actions !== undefined) {
    // We need name too — fetch it if not provided
    let name = input.name;
    if (!name) {
      const db = createServerClient();
      const { data } = await db
        .from("automation_rules")
        .select("name")
        .eq("id", parsed.data)
        .eq("city_id", admin.cityId)
        .maybeSingle<{ name: string }>();
      name = data?.name ?? "rule";
    }
    const validation = validateRule({
      name,
      conditions: input.conditions ?? [],
      actions: input.actions ?? [{ type: "auto_acknowledge", value: true }],
    });
    if (!validation.ok) return { ok: false, error: validation.error };
  }

  try {
    const db = createServerClient();
    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) updates.name = input.name.trim();
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.enabled !== undefined) updates.enabled = input.enabled;
    if (input.conditions !== undefined) updates.conditions = input.conditions;
    if (input.actions !== undefined) updates.actions = input.actions;

    const { error } = await db
      .from("automation_rules")
      .update(updates)
      .eq("id", parsed.data)
      .eq("city_id", admin.cityId);

    if (error) {
      log.error("updateRuleAction failed", error, { id });
      return { ok: false, error: "db_error" };
    }

    revalidatePath("/admin/automation");
    return { ok: true, data: undefined };
  } catch (err) {
    log.error("updateRuleAction threw", err, { id });
    return { ok: false, error: "db_error" };
  }
}

// ---------------------------------------------------------------------------
// toggleRuleAction
// ---------------------------------------------------------------------------
export async function toggleRuleAction(
  id: string,
  enabled: boolean,
): Promise<Result<void>> {
  const admin = await requireAdminScope();
  if (!admin) return { ok: false, error: "unauthorized" };

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "invalid_id" };

  try {
    const db = createServerClient();
    const { error } = await db
      .from("automation_rules")
      .update({ enabled })
      .eq("id", parsed.data)
      .eq("city_id", admin.cityId);

    if (error) {
      log.error("toggleRuleAction failed", error, { id });
      return { ok: false, error: "db_error" };
    }

    revalidatePath("/admin/automation");
    return { ok: true, data: undefined };
  } catch (err) {
    log.error("toggleRuleAction threw", err, { id });
    return { ok: false, error: "db_error" };
  }
}

// ---------------------------------------------------------------------------
// deleteRuleAction
// ---------------------------------------------------------------------------
export async function deleteRuleAction(id: string): Promise<Result<void>> {
  const admin = await requireAdminScope();
  if (!admin) return { ok: false, error: "unauthorized" };

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "invalid_id" };

  try {
    const db = createServerClient();
    const { error } = await db
      .from("automation_rules")
      .delete()
      .eq("id", parsed.data)
      .eq("city_id", admin.cityId);

    if (error) {
      log.error("deleteRuleAction failed", error, { id });
      return { ok: false, error: "db_error" };
    }

    revalidatePath("/admin/automation");
    return { ok: true, data: undefined };
  } catch (err) {
    log.error("deleteRuleAction threw", err, { id });
    return { ok: false, error: "db_error" };
  }
}
