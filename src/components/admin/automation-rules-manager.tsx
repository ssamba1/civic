"use client";

import { useId, useState, useTransition } from "react";
import type { AutomationRuleRow } from "@/app/admin/automation/actions";
import {
  createRuleAction,
  deleteRuleAction,
  toggleRuleAction,
} from "@/app/admin/automation/actions";
import type {
  Action,
  ActionType,
  Condition,
  ConditionField,
  ConditionOp,
  Priority,
} from "@/lib/automation/rules";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONDITION_FIELDS: { value: ConditionField; label: string }[] = [
  { value: "category", label: "Category" },
  { value: "severity", label: "Severity" },
  { value: "is_emergency", label: "Is emergency" },
  { value: "tag", label: "Tag" },
];

const CONDITION_OPS: { value: ConditionOp; label: string }[] = [
  { value: "eq", label: "=" },
  { value: "gte", label: ">=" },
  { value: "lte", label: "<=" },
  { value: "in", label: "in" },
  { value: "contains", label: "contains" },
];

const ACTION_TYPES: { value: ActionType; label: string }[] = [
  { value: "set_priority", label: "Set priority" },
  { value: "assign_team", label: "Assign team" },
  { value: "auto_acknowledge", label: "Auto-acknowledge" },
  { value: "add_tag", label: "Add tag" },
  { value: "set_severity", label: "Set severity" },
];

const PRIORITY_OPTIONS: Priority[] = ["low", "medium", "high", "critical"];
const CATEGORIES = [
  "pothole",
  "streetlight",
  "downed_sign",
  "graffiti",
  "illegal_dump",
  "water_leak",
  "sidewalk_damage",
  "tree_down",
  "debris",
  "drainage",
  "faded_signage",
  "other",
];

// ---------------------------------------------------------------------------
// Stable-id helpers
// ---------------------------------------------------------------------------

// Module-level counter for generating stable row ids.  Using a simple
// incrementing integer avoids Math.random/Date.now (banned) while still
// producing unique keys within the page lifecycle.  Read-only display chips
// in RulesTable can stay index-keyed because they are never reordered in place.
let _seq = 0;
function nextId() {
  return ++_seq;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultCondition(): Condition & { _id: number } {
  return { _id: nextId(), field: "category", op: "eq", value: "pothole" };
}

function defaultAction(): Action & { _id: number } {
  return { _id: nextId(), type: "set_priority", value: "medium" };
}

function conditionValueInput(
  cond: Condition,
  onChange: (v: Condition["value"]) => void,
): React.ReactNode {
  if (cond.field === "category") {
    if (cond.op === "in") {
      const arr = Array.isArray(cond.value) ? (cond.value as string[]) : [];
      return (
        <input
          className={inputCls}
          placeholder="pothole,graffiti"
          value={arr.join(",")}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
        />
      );
    }
    return (
      <select
        className={inputCls}
        value={cond.value as string}
        onChange={(e) => onChange(e.target.value)}
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    );
  }
  if (cond.field === "severity") {
    return (
      <input
        type="number"
        min={1}
        max={5}
        className={inputCls}
        value={cond.value as number}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    );
  }
  if (cond.field === "is_emergency") {
    return (
      <select
        className={inputCls}
        value={String(cond.value)}
        onChange={(e) => onChange(e.target.value === "true")}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  // tag, scalar string or array for "contains"
  return (
    <input
      className={inputCls}
      placeholder="tag name"
      value={cond.value as string}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function actionValueInput(
  action: Action,
  onChange: (v: Action["value"]) => void,
): React.ReactNode {
  if (action.type === "set_priority") {
    return (
      <select
        className={inputCls}
        value={action.value as string}
        onChange={(e) => onChange(e.target.value)}
      >
        {PRIORITY_OPTIONS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    );
  }
  if (action.type === "set_severity") {
    return (
      <input
        type="number"
        min={1}
        max={5}
        className={inputCls}
        value={action.value as number}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    );
  }
  if (action.type === "auto_acknowledge") {
    return <span className="text-sm text-zinc-500 italic">always true</span>;
  }
  return (
    <input
      className={inputCls}
      placeholder={action.type === "assign_team" ? "team key" : "tag name"}
      value={action.value as string}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

const inputCls =
  "rounded border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500";
const btnBase =
  "rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50";

// ---------------------------------------------------------------------------
// Rule Builder Form
// ---------------------------------------------------------------------------

interface BuilderProps {
  cityId: string;
  onCreated: (rule: AutomationRuleRow) => void;
}

type ConditionWithId = Condition & { _id: number };
type ActionWithId = Action & { _id: number };

function RuleBuilderForm({ cityId, onCreated }: BuilderProps) {
  const formId = useId();
  const [name, setName] = useState("");
  const [priority, setPriority] = useState(0);
  const [conditions, setConditions] = useState<ConditionWithId[]>([
    defaultCondition(),
  ]);
  const [actions, setActions] = useState<ActionWithId[]>([defaultAction()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function updateCondition(i: number, patch: Partial<Condition>) {
    setConditions(
      (prev) =>
        prev.map((c, idx) =>
          idx === i ? { ...c, ...patch } : c,
        ) as ConditionWithId[],
    );
  }
  function updateAction(i: number, patch: Partial<Action>) {
    setActions(
      (prev) =>
        prev.map((a, idx) =>
          idx === i ? { ...a, ...patch } : a,
        ) as ActionWithId[],
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Strip UI-only _id fields before sending to the server action.
    const plainConditions: Condition[] = conditions.map(
      ({ _id: _ignored, ...c }) => c,
    );
    const plainActions: Action[] = actions.map(({ _id: _ignored, ...a }) => a);
    startTransition(async () => {
      const result = await createRuleAction({
        cityId,
        name,
        priority,
        conditions: plainConditions,
        actions: plainActions,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Reset form
      setName("");
      setPriority(0);
      setConditions([defaultCondition()]);
      setActions([defaultAction()]);
      onCreated({
        id: result.data.id,
        city_id: cityId,
        name,
        enabled: true,
        priority,
        conditions: plainConditions,
        actions: plainActions,
      });
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name + priority */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label
            htmlFor={`${formId}-name`}
            className="block text-xs font-medium text-zinc-500 mb-1"
          >
            Rule name
          </label>
          <input
            id={`${formId}-name`}
            className={`${inputCls} w-full`}
            placeholder="e.g. Pothole high-severity escalate"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="w-24">
          <label
            htmlFor={`${formId}-priority`}
            className="block text-xs font-medium text-zinc-500 mb-1"
          >
            Priority
          </label>
          <input
            id={`${formId}-priority`}
            type="number"
            className={`${inputCls} w-full`}
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
          />
        </div>
      </div>

      {/* Conditions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-zinc-500">
            IF (all conditions)
          </span>
          <button
            type="button"
            className="text-xs text-blue-600 hover:text-blue-800"
            onClick={() =>
              setConditions((prev) => [
                ...prev,
                defaultCondition() as ConditionWithId,
              ])
            }
          >
            + Add condition
          </button>
        </div>
        <div className="space-y-2">
          {conditions.map((cond, i) => (
            <div key={cond._id} className="flex items-center gap-2">
              <select
                className={inputCls}
                value={cond.field}
                onChange={(e) =>
                  updateCondition(i, {
                    field: e.target.value as ConditionField,
                    value:
                      e.target.value === "severity"
                        ? 3
                        : e.target.value === "is_emergency"
                          ? false
                          : "pothole",
                  })
                }
              >
                {CONDITION_FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select
                className={inputCls}
                value={cond.op}
                onChange={(e) =>
                  updateCondition(i, { op: e.target.value as ConditionOp })
                }
              >
                {CONDITION_OPS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {conditionValueInput(cond, (v) =>
                updateCondition(i, { value: v }),
              )}
              {conditions.length > 1 && (
                <button
                  type="button"
                  className="text-xs text-red-400 hover:text-red-600"
                  onClick={() =>
                    setConditions((prev) => prev.filter((_, idx) => idx !== i))
                  }
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-zinc-500">
            THEN (actions)
          </span>
          <button
            type="button"
            className="text-xs text-blue-600 hover:text-blue-800"
            onClick={() =>
              setActions((prev) => [...prev, defaultAction() as ActionWithId])
            }
          >
            + Add action
          </button>
        </div>
        <div className="space-y-2">
          {actions.map((action, i) => (
            <div
              key={(action as ActionWithId)._id}
              className="flex items-center gap-2"
            >
              <select
                className={inputCls}
                value={action.type}
                onChange={(e) =>
                  updateAction(i, {
                    type: e.target.value as ActionType,
                    value:
                      e.target.value === "auto_acknowledge"
                        ? true
                        : e.target.value === "set_priority"
                          ? "medium"
                          : e.target.value === "set_severity"
                            ? 3
                            : "",
                  })
                }
              >
                {ACTION_TYPES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              {actionValueInput(action, (v) => updateAction(i, { value: v }))}
              {actions.length > 1 && (
                <button
                  type="button"
                  className="text-xs text-red-400 hover:text-red-600"
                  onClick={() =>
                    setActions((prev) => prev.filter((_, idx) => idx !== i))
                  }
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className={`${btnBase} bg-blue-600 text-white hover:bg-blue-700`}
      >
        {pending ? "Saving…" : "Create rule"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Rules Table
// ---------------------------------------------------------------------------

interface TableProps {
  rules: AutomationRuleRow[];
  onChange: (rules: AutomationRuleRow[]) => void;
}

function RulesTable({ rules, onChange }: TableProps) {
  const [busy, setBusy] = useState<string | null>(null);

  async function handleToggle(id: string, current: boolean) {
    setBusy(id);
    const result = await toggleRuleAction(id, !current);
    if (result.ok) {
      onChange(
        rules.map((r) => (r.id === id ? { ...r, enabled: !current } : r)),
      );
    }
    setBusy(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this automation rule?")) return;
    setBusy(id);
    const result = await deleteRuleAction(id);
    if (result.ok) {
      onChange(rules.filter((r) => r.id !== id));
    }
    setBusy(null);
  }

  if (rules.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center">
        <p className="text-sm text-zinc-500">No automation rules yet.</p>
        <p className="mt-1 text-xs text-zinc-400">
          Create your first rule to auto-route or escalate reports.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-700 text-left">
            <th className="pb-2 pr-4 font-medium text-zinc-600 dark:text-zinc-400">
              Name
            </th>
            <th className="pb-2 pr-4 font-medium text-zinc-600 dark:text-zinc-400">
              Priority
            </th>
            <th className="pb-2 pr-4 font-medium text-zinc-600 dark:text-zinc-400">
              Conditions
            </th>
            <th className="pb-2 pr-4 font-medium text-zinc-600 dark:text-zinc-400">
              Actions
            </th>
            <th className="pb-2 pr-4 font-medium text-zinc-600 dark:text-zinc-400">
              Status
            </th>
            <th className="pb-2 font-medium text-zinc-600 dark:text-zinc-400" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rules.map((rule) => (
            <tr key={rule.id} className="py-2">
              <td className="py-2 pr-4 font-medium text-zinc-900 dark:text-zinc-100">
                {rule.name || "-"}
              </td>
              <td className="py-2 pr-4 text-zinc-500">{rule.priority}</td>
              <td className="py-2 pr-4">
                <div className="flex flex-wrap gap-1">
                  {(rule.conditions as Condition[]).map((c) => (
                    <span
                      key={`${c.field}-${c.op}-${String(c.value)}`}
                      className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                    >
                      {c.field} {c.op}{" "}
                      {Array.isArray(c.value)
                        ? c.value.join(",")
                        : String(c.value)}
                    </span>
                  ))}
                  {(rule.conditions as Condition[]).length === 0 && (
                    <span className="text-xs text-zinc-400 italic">always</span>
                  )}
                </div>
              </td>
              <td className="py-2 pr-4">
                <div className="flex flex-wrap gap-1">
                  {(rule.actions as Action[]).map((a) => (
                    <span
                      key={`${a.type}-${String(a.value)}`}
                      className="rounded bg-green-50 px-1.5 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-300"
                    >
                      {a.type}={String(a.value)}
                    </span>
                  ))}
                </div>
              </td>
              <td className="py-2 pr-4">
                <button
                  type="button"
                  disabled={busy === rule.id}
                  onClick={() => handleToggle(rule.id, rule.enabled)}
                  className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                    rule.enabled
                      ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-300"
                      : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800"
                  }`}
                >
                  {rule.enabled ? "active" : "paused"}
                </button>
              </td>
              <td className="py-2 text-right">
                <button
                  type="button"
                  disabled={busy === rule.id}
                  onClick={() => handleDelete(rule.id)}
                  className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

interface Props {
  cityId: string;
  initialRules: AutomationRuleRow[];
}

export function AutomationRulesManager({ cityId, initialRules }: Props) {
  const [rules, setRules] = useState<AutomationRuleRow[]>(initialRules);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-4 text-base font-medium text-zinc-900 dark:text-zinc-100">
          Create rule
        </h2>
        <RuleBuilderForm
          cityId={cityId}
          onCreated={(rule) =>
            setRules((prev) =>
              [...prev, rule].sort((a, b) => a.priority - b.priority),
            )
          }
        />
      </section>

      <section>
        <h2 className="mb-4 text-base font-medium text-zinc-900 dark:text-zinc-100">
          Rules ({rules.length})
        </h2>
        <RulesTable rules={rules} onChange={setRules} />
      </section>
    </div>
  );
}
