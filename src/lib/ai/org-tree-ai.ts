import {
  GoogleGenerativeAI,
  type ObjectSchema,
  SchemaType,
} from "@google/generative-ai";
import { z } from "zod/v4";
import { AI_TIMEOUT_MS, GEMINI_MODEL } from "@/lib/ai/config";
import { checkAndRecordGeminiCall } from "@/lib/ai/rate-limiter";
import { withRetry } from "@/lib/ai/retry";
import { serverEnv } from "@/lib/env";
import type { Result } from "@/lib/types";

/* ==================================================================
   Onboarding org-tree generation (advanced routing, migration 042).

   A city describes its operations in prose ("two road crews, we contract out
   tree removal, the sign shop is shared with the county"). Gemini proposes an
   org_units tree — teams, subteams, crews, contractors — with categories,
   skills, capacity and per-job cost filled in. The proposal is ALWAYS reviewed
   and approved by a human before any write (see /api/ai/org-tree); the model
   never writes to the DB. Server-only, like every other Gemini call.
   ================================================================== */

/**
 * One proposed node. `parentKey` refers to another node's `key` in the same
 * proposal (null = root team). Flat list + parentKey keeps the model's job
 * simple and lets the persist step build the tree in dependency order.
 */
export const orgUnitProposalSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{2,40}$/),
  label: z.string().min(1).max(120),
  kind: z.enum(["team", "subteam", "crew", "contractor"]),
  parentKey: z.string().nullable(),
  categories: z.array(z.string()).nullable(),
  skills: z.array(z.string()),
  isContractor: z.boolean(),
  capacity: z.number().int().positive().nullable(),
  costPerJob: z.number().min(0).nullable(),
  slaHours: z.number().int().positive().nullable(),
});
export type OrgUnitProposal = z.infer<typeof orgUnitProposalSchema>;

export const orgTreeProposalSchema = z.object({
  units: z.array(orgUnitProposalSchema).min(1).max(60),
  notes: z.string().default(""),
});
export type OrgTreeProposal = z.infer<typeof orgTreeProposalSchema>;

const GEMINI_ORG_TREE_SCHEMA: ObjectSchema = {
  type: SchemaType.OBJECT,
  properties: {
    units: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          key: { type: SchemaType.STRING },
          label: { type: SchemaType.STRING },
          kind: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["team", "subteam", "crew", "contractor"],
          },
          parentKey: { type: SchemaType.STRING, nullable: true },
          categories: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            nullable: true,
          },
          skills: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          isContractor: { type: SchemaType.BOOLEAN },
          capacity: { type: SchemaType.INTEGER, nullable: true },
          costPerJob: { type: SchemaType.NUMBER, nullable: true },
          slaHours: { type: SchemaType.INTEGER, nullable: true },
        },
        required: [
          "key",
          "label",
          "kind",
          "parentKey",
          "skills",
          "isContractor",
        ],
      },
    },
    notes: { type: SchemaType.STRING },
  },
  required: ["units"],
};

const SYSTEM_PROMPT = `You are an operations analyst designing a public-works dispatch org chart for a city's civic-repair system. Output a tree of org units used to route citizen repair reports to the right crew.

Rules:
- Roots are kind "team" (a division). Nest "subteam" for internal structure, "crew" for internal assignable units, "contractor" for external vendors (set isContractor true, and always give costPerJob).
- key: lowercase snake_case, unique across the whole tree. parentKey references another unit's key, or null for a root team.
- categories: the report categories this unit accepts, drawn ONLY from the provided category list. Set it on teams (and any unit that narrows scope); leave it null on a crew that simply inherits its team's scope.
- skills: crew_type keys this unit can perform, drawn ONLY from the provided crew-type list. Leave [] for a generic crew that can take any type in its team.
- capacity: max concurrent open jobs if the user implies a limit (small crew, single contractor), else null.
- costPerJob: required for contractors; null/0 for internal crews.
- slaHours: expected turnaround if the user states or implies one, else null.
Only use categories and crew types from the provided lists. Do not invent new ones. Prefer a shallow, realistic tree over deep nesting.`;

/**
 * Generate a proposed org tree from a city's operations description. Returns a
 * validated proposal for human review — NOT persisted. Rate-limited and
 * retried like classifyPhoto; degrades to ok:false so the caller shows an error
 * rather than crashing.
 */
export async function generateOrgTree(input: {
  description: string;
  categories: readonly string[];
  crewTypeKeys: readonly string[];
}): Promise<Result<OrgTreeProposal>> {
  const rateCheck = checkAndRecordGeminiCall();
  if (!rateCheck.allowed) {
    return {
      ok: false,
      error: `Gemini rate limit: ${rateCheck.reason}. Retry in ${Math.ceil((rateCheck.retryAfterMs ?? 0) / 1000)}s.`,
    };
  }

  const prompt = `City operations description:
"""
${input.description.slice(0, 4000)}
"""

Allowed report categories: ${input.categories.join(", ")}
Allowed crew types: ${input.crewTypeKeys.join(", ")}

Produce the org tree.`;

  try {
    const model = new GoogleGenerativeAI(
      serverEnv.GEMINI_API_KEY,
    ).getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: GEMINI_ORG_TREE_SCHEMA,
      },
    });

    const result = await withRetry(
      (signal) =>
        model.generateContent(prompt, { signal, timeout: AI_TIMEOUT_MS }),
      { timeoutMs: AI_TIMEOUT_MS },
    );

    const rawText = result.response?.text?.() ?? "";
    if (!rawText.trim()) {
      return { ok: false, error: "Gemini returned an empty response" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText.trim());
    } catch {
      return {
        ok: false,
        error: `Gemini returned invalid JSON: ${rawText.slice(0, 300)}`,
      };
    }

    const validation = orgTreeProposalSchema.safeParse(parsed);
    if (!validation.success) {
      return {
        ok: false,
        error: `Org-tree validation failed: ${JSON.stringify(validation.error.issues).slice(0, 400)}`,
      };
    }

    const check = validateTreeShape(
      validation.data,
      input.categories,
      input.crewTypeKeys,
    );
    if (!check.ok) return check;

    return { ok: true, data: validation.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Gemini API error: ${message}` };
  }
}

/**
 * Structural validation the model can't be trusted to self-enforce: unique
 * keys, resolvable non-cyclic parentKeys, contractors priced, and categories/
 * skills drawn only from the allowed lists. Pure — reused by the persist path
 * and unit-tested without a model call.
 */
export function validateTreeShape(
  tree: OrgTreeProposal,
  allowedCategories: readonly string[],
  allowedCrewTypes: readonly string[],
): Result<OrgTreeProposal> {
  const keys = new Set<string>();
  for (const u of tree.units) {
    if (keys.has(u.key)) return { ok: false, error: `duplicate key: ${u.key}` };
    keys.add(u.key);
  }

  const catSet = new Set(allowedCategories);
  const skillSet = new Set(allowedCrewTypes);
  const byKey = new Map(tree.units.map((u) => [u.key, u]));

  for (const u of tree.units) {
    if (u.parentKey !== null && !byKey.has(u.parentKey)) {
      return { ok: false, error: `${u.key}: unknown parentKey ${u.parentKey}` };
    }
    if (u.parentKey === u.key) {
      return { ok: false, error: `${u.key}: is its own parent` };
    }
    if (u.isContractor && !(u.costPerJob && u.costPerJob > 0)) {
      return { ok: false, error: `${u.key}: contractor without costPerJob` };
    }
    for (const c of u.categories ?? []) {
      if (!catSet.has(c))
        return { ok: false, error: `${u.key}: unknown category ${c}` };
    }
    for (const s of u.skills) {
      if (!skillSet.has(s))
        return { ok: false, error: `${u.key}: unknown skill ${s}` };
    }
  }

  // Cycle detection over parentKey chains.
  for (const start of tree.units) {
    const seen = new Set<string>();
    let cur: OrgUnitProposal | undefined = start;
    while (cur?.parentKey) {
      if (seen.has(cur.key)) {
        return { ok: false, error: `cycle through ${cur.key}` };
      }
      seen.add(cur.key);
      cur = byKey.get(cur.parentKey);
    }
  }

  return { ok: true, data: tree };
}
