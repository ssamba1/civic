/**
 * Privacy audit utilities.
 *
 * Verifies that no raw (unblurred) photos have leaked into the public bucket.
 * Intended for periodic cron checks and admin dashboard display.
 */

import { createServerClient } from "@/lib/db/client";

const PUBLIC_BUCKET = "photos-public";
const RAW_BUCKET = "photos-raw";

/**
 * Cross-reference public bucket contents against the raw bucket.
 *
 * A "violation" means a file exists in `photos-public` whose exact path
 * also exists in `photos-raw` AND has the same file size — a strong signal
 * that the raw original was uploaded to the public bucket instead of
 * (or in addition to) the blurred version.
 *
 * This is a heuristic: blurred files are always smaller than originals due
 * to information loss from the blur filter, so matching sizes indicate a
 * likely raw-photo leak.
 */
export async function auditPublicBucket(
  cityId: string,
): Promise<{ violations: string[] }> {
  const supabase = createServerClient();
  const violations: string[] = [];

  // List all files under this city in the public bucket
  const { data: publicFiles, error: publicErr } = await supabase.storage
    .from(PUBLIC_BUCKET)
    .list(cityId, { limit: 1000 });

  if (publicErr || !publicFiles) {
    violations.push(
      `Could not list public bucket for city ${cityId}: ${publicErr?.message ?? "unknown"}`,
    );
    return { violations };
  }

  // List the raw bucket once and index by name to avoid an N+1 of per-file RPCs
  const { data: rawFiles } = await supabase.storage
    .from(RAW_BUCKET)
    .list(cityId, { limit: 1000 });

  const rawMetaByName = new Map(
    rawFiles?.map((rawFile) => [rawFile.name, rawFile.metadata]) ?? [],
  );

  // For each public file, check if an identical-size file exists in raw
  for (const file of publicFiles) {
    const path = `${cityId}/${file.name}`;

    const rawMeta = rawMetaByName.get(file.name);

    // Size match is a strong indicator the raw file leaked to public
    if (
      rawMeta?.size &&
      file.metadata?.size &&
      rawMeta.size === file.metadata.size
    ) {
      violations.push(
        `Possible raw photo in public bucket: ${path} ` +
          `(public size: ${file.metadata.size}, raw size: ${rawMeta.size})`,
      );
    }
  }

  return { violations };
}

export interface BlurCoverage {
  withVersion: number;
  total: number;
  pct: number;
}

export interface CityPrivacyAudit {
  cityId: string;
  cityName: string;
  publicScanned: number;
  violations: string[];
  ok: boolean;
  blurCoverage: BlurCoverage;
}

export interface PrivacyAuditReport {
  generatedAt: string;
  cities: CityPrivacyAudit[];
  totalViolations: number;
  ok: boolean;
}

/**
 * OUTFLANK #34 — whole-deployment privacy audit for the admin dashboard + a
 * legal-exportable JSON. Runs {@link auditPublicBucket} for every city and rolls
 * up a pass/fail summary. `generatedAt` is passed in (callers stamp it) so the
 * function stays deterministic/testable.
 */
export async function auditAllCities(
  generatedAt: string,
): Promise<PrivacyAuditReport> {
  const supabase = createServerClient();
  const { data: cities } = await supabase
    .from("cities")
    .select("id, name")
    .order("name");

  const results: CityPrivacyAudit[] = [];
  for (const city of cities ?? []) {
    const { data: publicFiles } = await supabase.storage
      .from(PUBLIC_BUCKET)
      .list(city.id, { limit: 1000 });
    const { violations } = await auditPublicBucket(city.id);

    // Blur coverage — share of the city's reports that recorded a blur_version
    // (migration 040). Legacy rows are null (blur ran but pre-tracking); a
    // healthy live deployment trends to 100% as new reports flow in.
    const base = () =>
      supabase
        .from("reports")
        .select("*", { count: "exact", head: true })
        .eq("city_id", city.id);
    const [{ count: total }, { count: withVersion }] = await Promise.all([
      base(),
      base().not("blur_version", "is", null),
    ]);
    const totalN = total ?? 0;
    const withN = withVersion ?? 0;

    results.push({
      cityId: city.id,
      cityName: city.name ?? city.id,
      publicScanned: publicFiles?.length ?? 0,
      violations,
      ok: violations.length === 0,
      blurCoverage: {
        withVersion: withN,
        total: totalN,
        pct: totalN === 0 ? 0 : Math.round((withN / totalN) * 1000) / 10,
      },
    });
  }

  const totalViolations = results.reduce((s, c) => s + c.violations.length, 0);
  return {
    generatedAt,
    cities: results,
    totalViolations,
    ok: totalViolations === 0,
  };
}
