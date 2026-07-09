"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { DEMO_SESSION_COOKIE, findDemoAccount } from "@/lib/demo-auth";
import { DEMO_MODE } from "@/lib/demo-mode";
import { validateRule } from "@/lib/automation/rules";
import type { AutomationRule, Condition, Action } from "@/lib/automation/rules";
import type { Result } from "@/lib/types";

// ---------------------------------------------------------------------------
// Admin guard — mirrors pattern from admin/webhooks/actions.ts
// ---------------------------------------------------------------------------
async function requireAdmin(): Promise<boolean> {
  if (DEMO_MODE) {
    const demo = findDemoAccount(
      (await cookies()).get(DEMO_SESSION_COOKIE)?.value,
    );
    if (demo?.role === "admin") return true;
  }
  const devBypass =
    process.env.NODE_ENV === "development" &&
    process.env.DEV_AUTH_BYPASS === "1";
  if (devBypass) return true;

  const user = await getAuthUser();
  if (!user) return false;
  const db = createServerClient();
  const { data } = await db
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();
  return data?.role === "admin";
}

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
  if (!(await requireAdmin())) return { ok: false, error: "unauthorized" };

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("automation_rules")
      .select("*")
      .eq("city_id", cityId)
      .order("priority", { ascending: true });

    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []) as AutomationRuleRow[] };
  } catch (err) {
    // Graceful degrade if table doesn't exist yet
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("relation") && msg.includes("does not exist")) {
      return { ok: true, data: [] };
    }
    return { ok: false, error: msg };
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
  if (!(await requireAdmin())) return { ok: false, error: "unauthorized" };

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
        city_id: input.cityId,
        name: input.name.trim(),
        priority: input.priority ?? 0,
        conditions: input.conditions,
        actions: input.actions,
        enabled: true,
      })
      .select("id")
      .single();

    if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };

    revalidatePath("/admin/automation");
    return { ok: true, data: { id: data.id as string } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
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
  if (!(await requireAdmin())) return { ok: false, error: "unauthorized" };

  // Validate if conditions/actions are being updated
  if (input.conditions !== undefined || input.actions !== undefined) {
    // We need name too — fetch it if not provided
    let name = input.name;
    if (!name) {
      const db = createServerClient();
      const { data } = await db
        .from("automation_rules")
        .select("name")
        .eq("id", id)
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
      .eq("id", id);

    if (error) return { ok: false, error: error.message };

    revalidatePath("/admin/automation");
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// toggleRuleAction
// ---------------------------------------------------------------------------
export async function toggleRuleAction(
  id: string,
  enabled: boolean,
): Promise<Result<void>> {
  if (!(await requireAdmin())) return { ok: false, error: "unauthorized" };

  try {
    const db = createServerClient();
    const { error } = await db
      .from("automation_rules")
      .update({ enabled })
      .eq("id", id);

    if (error) return { ok: false, error: error.message };

    revalidatePath("/admin/automation");
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// deleteRuleAction
// ---------------------------------------------------------------------------
export async function deleteRuleAction(id: string): Promise<Result<void>> {
  if (!(await requireAdmin())) return { ok: false, error: "unauthorized" };

  try {
    const db = createServerClient();
    const { error } = await db
      .from("automation_rules")
      .delete()
      .eq("id", id);

    if (error) return { ok: false, error: error.message };

    revalidatePath("/admin/automation");
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
