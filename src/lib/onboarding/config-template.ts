// Config template applier (F3) — seeds a new city's per-city config tables from
// the app defaults (teams.ts + SLA/cost), so a provisioned city inherits a
// working, overridable setup instead of empty config. Idempotent (upsert).
// SERVER-ONLY; runs as service role inside provisioning.

import { estimateCost } from "@/lib/ai/work-order-rules";
import { CATEGORY_SLA_TARGETS } from "@/lib/dashboard-data";
import type { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import { categoryToTeamDefault, TEAM_LIST } from "@/lib/teams";
import type { ReportCategory, Result } from "@/lib/types";

const logger = createLogger("config-template");

type SupabaseLike = ReturnType<typeof createServerClient>;

const CATEGORIES = Object.keys(CATEGORY_SLA_TARGETS) as ReportCategory[];

export interface ConfigTemplateSummary {
  departments: number;
  routing: number;
  sla: number;
  cost: number;
}

/**
 * Seed city_departments / category_routing / sla_targets / cost_rules for a new
 * city from the static defaults. Upserts so re-running is a no-op. Returns counts.
 */
export async function applyConfigTemplate(
  db: SupabaseLike,
  cityId: string,
): Promise<Result<ConfigTemplateSummary>> {
  const departments = TEAM_LIST.filter((t) => t.id !== "all").map((t) => ({
    city_id: cityId,
    team_id: t.id,
    label: t.label,
    short_label: t.shortLabel,
    color: t.color,
    icon: t.icon,
    active: true,
  }));

  const routing = CATEGORIES.map((category) => ({
    city_id: cityId,
    category,
    team_id: categoryToTeamDefault(category),
    escalates_to_parent: false,
  }));

  const sla = CATEGORIES.map((category) => ({
    city_id: cityId,
    category,
    hours: CATEGORY_SLA_TARGETS[category],
  }));

  const cost = CATEGORIES.map((category) => ({
    city_id: cityId,
    category,
    est_cost: estimateCost(category),
    materials: [] as string[],
  }));

  const stages: [string, Record<string, unknown>[], string][] = [
    ["city_departments", departments, "city_id,team_id"],
    ["category_routing", routing, "city_id,category"],
    ["sla_targets", sla, "city_id,category"],
    ["cost_rules", cost, "city_id,category"],
  ];

  for (const [table, rows, onConflict] of stages) {
    const { error } = await db.from(table).upsert(rows, { onConflict });
    if (error) {
      logger.error("config_template_failed", undefined, {
        cityId,
        table,
        error: error.message,
      });
      return {
        ok: false,
        error: `CONFIG_${table.toUpperCase()}: ${error.message}`,
      };
    }
  }

  return {
    ok: true,
    data: {
      departments: departments.length,
      routing: routing.length,
      sla: sla.length,
      cost: cost.length,
    },
  };
}
