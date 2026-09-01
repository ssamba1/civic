"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod/v4";
import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { DEMO_SESSION_COOKIE } from "@/lib/demo-auth";
import { findVerifiedDemoAccount } from "@/lib/demo-cookie";
import { DEMO_MODE } from "@/lib/demo-mode";
import { applyConfigTemplate } from "@/lib/onboarding/config-template";
import { coldStart } from "@/lib/onboarding/ingest/cold-start";
import { provisionCity } from "@/lib/onboarding/provision-city";
import {
  type BoundaryGeometry,
  type CityCandidate,
  fetchCityBoundary,
  resolveCityCandidates,
} from "@/lib/onboarding/tiger";
import type { Result } from "@/lib/types";

// Server Actions are public endpoints. Re-check authorization here, never rely
// on the layout gate alone. Demo persona + dev bypass mirror the layout so the
// console is reachable in the demo, but only the admin persona, only when
// DEMO_MODE is on (the cookie is client-supplied; see T0.1).
async function requireAdmin(): Promise<boolean> {
  if (DEMO_MODE) {
    const demo = findVerifiedDemoAccount(
      (await cookies()).get(DEMO_SESSION_COOKIE)?.value,
    );
    if (demo?.role === "admin") return true;
  }
  if (
    process.env.NODE_ENV === "development" &&
    process.env.DEV_AUTH_BYPASS === "1"
  ) {
    return true;
  }
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

const resolveSchema = z.object({
  name: z.string().min(1).max(100),
  state: z.string().min(2).max(40),
});

export async function resolveCityAction(input: {
  name: string;
  state: string;
}): Promise<Result<CityCandidate[]>> {
  if (!(await requireAdmin())) return { ok: false, error: "unauthorized" };
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid city or state" };
  return resolveCityCandidates(parsed.data);
}

export async function fetchBoundaryAction(
  candidate: CityCandidate,
): Promise<Result<BoundaryGeometry>> {
  if (!(await requireAdmin())) return { ok: false, error: "unauthorized" };
  return fetchCityBoundary(candidate);
}

export interface ProvisionSeedResult {
  cityId: string;
  slug: string;
  source: "arcgis" | "synthetic";
  inserted: number;
  degraded?: string;
}

/**
 * Provision the chosen candidate (active=false) then cold-start fill it. Runs the
 * fill inline for the MVP (synthetic at this scale is fast); the full design moves
 * it to a background job + Realtime StatusBar. Creates a provision_jobs row so the
 * progress is recorded.
 */
export async function provisionAndSeedAction(input: {
  candidate: CityCandidate;
  syntheticCount?: number;
}): Promise<Result<ProvisionSeedResult>> {
  if (!(await requireAdmin())) return { ok: false, error: "unauthorized" };

  const provisioned = await provisionCity({ candidate: input.candidate });
  if (!provisioned.ok) return provisioned;

  const db = createServerClient();

  // Seed per-city config from the defaults (F3). Best-effort: a failure (e.g.
  // un-migrated config tables) must not block cold-start. The app falls back to
  // the static teams.ts config.
  await applyConfigTemplate(db, provisioned.data.cityId);
  const { data: job } = await db
    .from("provision_jobs")
    .insert({ city_id: provisioned.data.cityId, status: "pending" })
    .select("id")
    .single<{ id: string }>();

  const seeded = await coldStart(
    {
      cityId: provisioned.data.cityId,
      boundary: provisioned.data.boundary,
      syntheticCount: input.syntheticCount ?? 200,
    },
    { db, jobId: job?.id },
  );
  if (!seeded.ok) return seeded;

  return {
    ok: true,
    data: {
      cityId: provisioned.data.cityId,
      slug: provisioned.data.slug,
      source: seeded.data.source,
      inserted: seeded.data.inserted,
      degraded: seeded.data.degraded,
    },
  };
}

export async function goLiveAction(input: {
  cityId: string;
  slug: string;
}): Promise<Result<true>> {
  if (!(await requireAdmin())) return { ok: false, error: "unauthorized" };
  const db = createServerClient();
  const { error } = await db
    .from("cities")
    .update({ active: true })
    .eq("id", input.cityId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/city/${input.slug}`);
  revalidatePath("/admin/cities");
  return { ok: true, data: true };
}
