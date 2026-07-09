/**
 * Automation Rules Engine — pure, no DB deps, no Next.js imports.
 *
 * Condition fields:
 *   category       – ReportCategory string
 *   severity       – 1-5 integer
 *   is_emergency   – boolean
 *   tag            – string (checks report.tags array if present)
 *
 * Condition ops:
 *   eq       – value === field value
 *   gte      – field value >= value  (numeric)
 *   lte      – field value <= value  (numeric)
 *   in       – value is array, field value is included
 *   contains – field is array, value is a member of it
 *
 * Action types:
 *   set_priority     – "low" | "medium" | "high" | "critical"
 *   assign_team      – team key string
 *   auto_acknowledge – true
 *   add_tag          – tag string (multiple rules can add different tags)
 *   set_severity     – 1-5 integer
 *
 * Rule evaluation:
 *   - Only enabled rules are considered.
 *   - Rules are sorted ascending by priority (lower number = higher precedence).
 *   - For each action type, the first matching rule that produces that action wins,
 *     EXCEPT for add_tag which accumulates from ALL matching rules.
 *   - evaluateRules returns the merged list of resolved actions.
 */

import type { Result } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConditionField = "category" | "severity" | "is_emergency" | "tag";
export type ConditionOp = "eq" | "gte" | "lte" | "in" | "contains";
export type ActionType =
  | "set_priority"
  | "assign_team"
  | "auto_acknowledge"
  | "add_tag"
  | "set_severity";

export type Priority = "low" | "medium" | "high" | "critical";

export interface Condition {
  field: ConditionField;
  op: ConditionOp;
  /** string | number | boolean | string[] depending on field + op */
  value: string | number | boolean | string[];
}

export interface Action {
  type: ActionType;
  value: string | number | boolean;
}

export interface AutomationRule {
  id: string;
  city_id: string;
  name: string;
  enabled: boolean;
  priority: number;
  conditions: Condition[];
  actions: Action[];
  created_at?: string;
  updated_at?: string;
}

/** Subset of a classified report needed by the engine */
export interface RuleReport {
  category: string;
  severity: number;
  is_emergency: boolean;
  /** Optional tag list attached to the report */
  tags?: string[];
}

/** Resolved output from evaluateRules */
export interface ResolvedActions {
  /** null if no rule set it */
  priority: Priority | null;
  /** null if no rule set it */
  assign_team: string | null;
  /** true if any matching rule set auto_acknowledge */
  auto_acknowledge: boolean;
  /** union of all tags added by matching rules */
  add_tags: string[];
  /** null if no rule set it */
  set_severity: number | null;
}

// ---------------------------------------------------------------------------
// Core: matchesCondition
// ---------------------------------------------------------------------------

export function matchesCondition(report: RuleReport, condition: Condition): boolean {
  const { field, op, value } = condition;

  let fieldValue: string | number | boolean | string[] | undefined;
  switch (field) {
    case "category":
      fieldValue = report.category;
      break;
    case "severity":
      fieldValue = report.severity;
      break;
    case "is_emergency":
      fieldValue = report.is_emergency;
      break;
    case "tag":
      fieldValue = report.tags ?? [];
      break;
    default:
      return false;
  }

  switch (op) {
    case "eq":
      return fieldValue === value;
    case "gte":
      return typeof fieldValue === "number" && typeof value === "number"
        ? fieldValue >= value
        : false;
    case "lte":
      return typeof fieldValue === "number" && typeof value === "number"
        ? fieldValue <= value
        : false;
    case "in":
      if (!Array.isArray(value)) return false;
      // fieldValue is a scalar; check if it's in the provided array
      return (value as (string | number | boolean)[]).includes(
        fieldValue as string | number | boolean,
      );
    case "contains":
      // fieldValue is an array; check if value (scalar) is a member
      if (!Array.isArray(fieldValue)) return false;
      return (fieldValue as string[]).includes(value as string);
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Core: evaluateRules
// ---------------------------------------------------------------------------

/**
 * Evaluate automation rules against a classified report.
 * Returns the merged set of resolved actions.
 *
 * Call this after AI classification, before persisting the work order.
 */
export function evaluateRules(
  report: RuleReport,
  rules: AutomationRule[],
): ResolvedActions {
  const resolved: ResolvedActions = {
    priority: null,
    assign_team: null,
    auto_acknowledge: false,
    add_tags: [],
    set_severity: null,
  };

  // Sort ascending by priority (lower number = higher precedence)
  const sorted = [...rules]
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    const allMatch = rule.conditions.every((c) => matchesCondition(report, c));
    if (!allMatch) continue;

    for (const action of rule.actions) {
      switch (action.type) {
        case "set_priority":
          // First-match-wins
          if (resolved.priority === null) {
            resolved.priority = action.value as Priority;
          }
          break;
        case "assign_team":
          // First-match-wins
          if (resolved.assign_team === null) {
            resolved.assign_team = action.value as string;
          }
          break;
        case "auto_acknowledge":
          // Any matching rule sets this to true
          resolved.auto_acknowledge = true;
          break;
        case "add_tag":
          // Accumulate from all matching rules (de-dup)
          if (!resolved.add_tags.includes(action.value as string)) {
            resolved.add_tags.push(action.value as string);
          }
          break;
        case "set_severity":
          // First-match-wins
          if (resolved.set_severity === null) {
            resolved.set_severity = action.value as number;
          }
          break;
      }
    }
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_FIELDS: ConditionField[] = ["category", "severity", "is_emergency", "tag"];
const VALID_OPS: ConditionOp[] = ["eq", "gte", "lte", "in", "contains"];
const VALID_ACTION_TYPES: ActionType[] = [
  "set_priority",
  "assign_team",
  "auto_acknowledge",
  "add_tag",
  "set_severity",
];
const VALID_PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];

function validateCondition(c: unknown, idx: number): string | null {
  if (typeof c !== "object" || c === null) {
    return `conditions[${idx}]: must be an object`;
  }
  const obj = c as Record<string, unknown>;
  if (!VALID_FIELDS.includes(obj.field as ConditionField)) {
    return `conditions[${idx}].field: must be one of ${VALID_FIELDS.join(", ")}`;
  }
  if (!VALID_OPS.includes(obj.op as ConditionOp)) {
    return `conditions[${idx}].op: must be one of ${VALID_OPS.join(", ")}`;
  }
  // op-specific value checks
  const op = obj.op as ConditionOp;
  if ((op === "gte" || op === "lte") && typeof obj.value !== "number") {
    return `conditions[${idx}].value: must be a number for op=${op}`;
  }
  if (op === "in" && !Array.isArray(obj.value)) {
    return `conditions[${idx}].value: must be an array for op=in`;
  }
  return null;
}

function validateAction(a: unknown, idx: number): string | null {
  if (typeof a !== "object" || a === null) {
    return `actions[${idx}]: must be an object`;
  }
  const obj = a as Record<string, unknown>;
  if (!VALID_ACTION_TYPES.includes(obj.type as ActionType)) {
    return `actions[${idx}].type: must be one of ${VALID_ACTION_TYPES.join(", ")}`;
  }
  const type = obj.type as ActionType;
  if (type === "set_priority" && !VALID_PRIORITIES.includes(obj.value as Priority)) {
    return `actions[${idx}].value: must be one of ${VALID_PRIORITIES.join(", ")} for type=set_priority`;
  }
  if (type === "set_severity") {
    const v = obj.value as number;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5) {
      return `actions[${idx}].value: must be integer 1-5 for type=set_severity`;
    }
  }
  if (type === "assign_team" && (typeof obj.value !== "string" || !obj.value)) {
    return `actions[${idx}].value: must be a non-empty string for type=assign_team`;
  }
  if (type === "add_tag" && (typeof obj.value !== "string" || !obj.value)) {
    return `actions[${idx}].value: must be a non-empty string for type=add_tag`;
  }
  if (type === "auto_acknowledge" && obj.value !== true) {
    return `actions[${idx}].value: must be true for type=auto_acknowledge`;
  }
  return null;
}

/**
 * Validate a rule's conditions and actions.
 * Returns { ok: true } or { ok: false, error: "<message>" }.
 */
export function validateRule(
  rule: Pick<AutomationRule, "name" | "conditions" | "actions">,
): Result<void> {
  if (!rule.name?.trim()) {
    return { ok: false, error: "name: must not be empty" };
  }
  if (!Array.isArray(rule.conditions)) {
    return { ok: false, error: "conditions: must be an array" };
  }
  if (!Array.isArray(rule.actions)) {
    return { ok: false, error: "actions: must be an array" };
  }
  if (rule.actions.length === 0) {
    return { ok: false, error: "actions: must have at least one action" };
  }
  for (let i = 0; i < rule.conditions.length; i++) {
    const err = validateCondition(rule.conditions[i], i);
    if (err) return { ok: false, error: err };
  }
  for (let i = 0; i < rule.actions.length; i++) {
    const err = validateAction(rule.actions[i], i);
    if (err) return { ok: false, error: err };
  }
  return { ok: true, data: undefined };
}
