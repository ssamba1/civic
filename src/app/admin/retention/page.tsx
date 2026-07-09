import { createServerClient } from "@/lib/db/client";
import { RetentionForm } from "@/components/admin/retention-form";
import { getRetentionSettings } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Data retention | Civic Admin" };

export default async function RetentionPage() {
  // Fetch the first city for the admin to configure. In a multi-city setup
  // this page would accept a searchParam for city selection; for v1 it
  // defaults to the first active city returned by the service client.
  const db = createServerClient();
  const { data: cities } = await db
    .from("cities")
    .select("id, name")
    .eq("active", true)
    .order("name")
    .limit(10);

  const firstCity = cities?.[0] ?? null;

  let settings = null;
  if (firstCity) {
    const result = await getRetentionSettings(firstCity.id);
    if (result.ok) settings = result.data;
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Data retention
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Configure how long raw photos and report descriptions are retained
        before automatic deletion.
      </p>

      {!firstCity && (
        <p className="mt-6 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
          No active cities found. Onboard a city first.
        </p>
      )}

      {firstCity && settings && (
        <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-base font-medium text-zinc-900 dark:text-zinc-100">
            {firstCity.name}
          </h2>
          <RetentionForm cityId={firstCity.id} initial={settings} />
        </div>
      )}

      <div className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
        <p className="font-medium">How retention works</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>
            Raw photos (originals) are stored in the restricted{" "}
            <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">
              photos-raw
            </code>{" "}
            bucket and deleted by a nightly pg_cron job after the configured TTL.
          </li>
          <li>
            Report descriptions are stored as-is and soft-cleared after the
            free-text TTL. PII is already redacted at intake.
          </li>
          <li>
            Changes take effect on the next scheduled cleanup run (03:00 UTC
            daily).
          </li>
        </ul>
      </div>
    </div>
  );
}
