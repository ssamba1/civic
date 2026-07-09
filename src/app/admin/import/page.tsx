import { ImportWizard } from "@/components/admin/import-wizard";
import { listCities } from "@/lib/onboarding/cities";

export const dynamic = "force-dynamic";

export default async function AdminImportPage() {
  const cities = await listCities();
  const cityOptions = cities.map((c) => ({
    id: c.id,
    label: `${c.name}, ${c.state}`,
  }));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-foreground)]">
          Legacy data importer
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
          Migrate historical report data from CSV exports or SeeClickFix JSON
          into Civic. Records are normalized through the standard ingest
          adapters and bulk-inserted with placeholder classifications. Rows with
          invalid coordinates are silently skipped.
        </p>
      </div>

      {cityOptions.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          No cities provisioned yet. Onboard a city first before importing data.
        </div>
      ) : (
        <ImportWizard cities={cityOptions} />
      )}
    </div>
  );
}
