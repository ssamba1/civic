import { NextResponse } from "next/server";
import {
  generateOrgTree,
  orgTreeProposalSchema,
  validateTreeShape,
} from "@/lib/ai/org-tree-ai";
import { checkRateLimit, clientIp } from "@/lib/ai/rate-limit";
import { DEFAULT_CREW_TYPE_KEYS } from "@/lib/crew-types";
import { createServerClient } from "@/lib/db/client";
import { createSSRClient, getAuthUser } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";
import { ALL_CATEGORIES } from "@/lib/onboarding/presets";
import { persistOrgTree } from "@/lib/routing/org-units";

export const runtime = "nodejs";
export const maxDuration = 30;

const logger = createLogger("[org-tree-api]");
const ADMIN_ROLES = ["staff_supervisor", "admin"];

/**
 * Onboarding org-tree generation + commit (advanced routing, migration 042).
 *
 *   POST { action: "generate", description }
 *     → { proposal }   AI-proposed tree for review; NOTHING is written.
 *   POST { action: "commit", units }
 *     → { idByKey }    persist an approved (edited) tree for the caller's city.
 *
 * Admin-gated (supervisor/admin) and city-scoped: the tree is always written to
 * the caller's own city_id, never a client-supplied one. Rule 1 holds. The
 * model is only ever called here, server-side.
 */
export async function POST(request: Request) {
  const rl = checkRateLimit(`org_tree:${clientIp(request)}`, {
    windowMs: 60_000,
    max: 10,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ssr = await createSSRClient();
  const { data: profile } = await ssr
    .from("users")
    .select("role, city_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !ADMIN_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const cityId = profile.city_id as string | null;
  if (!cityId) {
    return NextResponse.json({ error: "No city on profile" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const action = (body as { action?: string })?.action;

  // City's crew-type catalog (031) → falls back to defaults; categories are the
  // app-wide preset list. Both bound what the model may emit.
  const db = createServerClient();
  const { data: ctRows } = await db
    .from("crew_types")
    .select("key")
    .eq("city_id", cityId)
    .eq("active", true);
  const crewTypeKeys =
    ctRows && ctRows.length > 0
      ? ctRows.map((r) => r.key as string)
      : DEFAULT_CREW_TYPE_KEYS;
  const categories = ALL_CATEGORIES as readonly string[];

  if (action === "generate") {
    const description = (body as { description?: string }).description ?? "";
    if (description.trim().length < 10) {
      return NextResponse.json(
        { error: "description too short" },
        { status: 400 },
      );
    }
    const result = await generateOrgTree({
      description,
      categories,
      crewTypeKeys,
    });
    if (!result.ok) {
      logger.warn("org_tree_generate_failed", { error: result.error });
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({ proposal: result.data });
  }

  if (action === "commit") {
    // Zod-parse the (possibly human-edited) tree, then structural re-validate,
    // before any write. The body is untrusted even from an admin session.
    const parsed = orgTreeProposalSchema.safeParse({
      units: (body as { units?: unknown }).units,
      notes: "",
    });
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: `invalid units: ${JSON.stringify(parsed.error.issues).slice(0, 300)}`,
        },
        { status: 400 },
      );
    }
    const shape = validateTreeShape(parsed.data, categories, crewTypeKeys);
    if (!shape.ok) {
      return NextResponse.json({ error: shape.error }, { status: 400 });
    }
    const persisted = await persistOrgTree(db, cityId, shape.data.units);
    if (!persisted.ok) {
      logger.warn("org_tree_commit_failed", { error: persisted.error });
      return NextResponse.json({ error: persisted.error }, { status: 500 });
    }
    logger.info("org_tree_committed", {
      cityId,
      count: shape.data.units.length,
    });
    return NextResponse.json({ idByKey: persisted.idByKey });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
