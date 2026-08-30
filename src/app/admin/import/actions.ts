"use server";

import { cookies } from "next/headers";
import { z } from "zod/v4";
import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { DEMO_SESSION_COOKIE } from "@/lib/demo-auth";
import { findVerifiedDemoAccount } from "@/lib/demo-cookie";
import { DEMO_MODE } from "@/lib/demo-mode";
import type { ImportSource } from "@/lib/import/normalize";
import { importFromText } from "@/lib/import/normalize";
import type { NormalizedReport } from "@/lib/onboarding/ingest/types";
import { ingestReports } from "@/lib/onboarding/ingest/writer";
import type { Result } from "@/lib/types";

async function requireAdmin(): Promise<boolean> {
  if (DEMO_MODE) {
    const demo = findVerifiedDemoAccount(
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

const parseSchema = z.object({
  text: z.string().min(1, "Content is required"),
  source: z.enum(["csv", "seeclickfix_json"]),
});

/** Parse the uploaded text and return a preview (up to 50 rows). */
export async function previewImportAction(input: {
  text: string;
  source: string;
}): Promise<Result<{ preview: NormalizedReport[]; total: number }>> {
  if (!(await requireAdmin())) return { ok: false, error: "unauthorized" };

  const parsed = parseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "invalid_input",
    };
  }

  const result = importFromText(
    parsed.data.text,
    parsed.data.source as ImportSource,
  );
  if (!result.ok) return result;

  return {
    ok: true,
    data: {
      preview: result.data.slice(0, 50),
      total: result.data.length,
    },
  };
}

const confirmSchema = z.object({
  text: z.string().min(1),
  source: z.enum(["csv", "seeclickfix_json"]),
  cityId: z.string().uuid("cityId is required"),
});

/** Parse + bulk-insert all records for the given city. */
export async function confirmImportAction(input: {
  text: string;
  source: string;
  cityId: string;
}): Promise<Result<{ inserted: number }>> {
  if (!(await requireAdmin())) return { ok: false, error: "unauthorized" };

  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "invalid_input",
    };
  }

  const parseResult = importFromText(
    parsed.data.text,
    parsed.data.source as ImportSource,
  );
  if (!parseResult.ok) return parseResult;

  if (parseResult.data.length === 0) {
    return { ok: true, data: { inserted: 0 } };
  }

  // Graceful degrade: if DB is unavailable, return a clear error rather than crash
  try {
    const ingestResult = await ingestReports(
      parsed.data.cityId,
      parseResult.data,
    );
    if (!ingestResult.ok) return ingestResult;
    return { ok: true, data: { inserted: ingestResult.data.inserted } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "bulk_insert_failed",
    };
  }
}
