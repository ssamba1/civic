import { AutomationRulesManager } from "@/components/admin/automation-rules-manager";
import { listCities } from "@/lib/onboarding/cities";
import { listRulesAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminAutomationPage() {
  const cities = await listCities();
  // Default to the first active city, or the first city overall
  const defaultCity = cities.find((c) => c.active) ?? cities[0] ?? null;

  const rulesResult = defaultCity
    ? await listRulesAction(defaultCity.id)
    : null;

  const rules = rulesResult?.ok ? rulesResult.data : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-foreground)]">
          Automation rules
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
          Configure IF/THEN rules evaluated when a report is classified. Rules
          are matched in priority order (lower number = higher precedence).
          First-match wins per action type; tags accumulate from all matching
          rules.
        </p>
        {defaultCity && (
          <p className="mt-1 text-xs text-zinc-400">
            City:{" "}
            <span className="font-medium text-zinc-600 dark:text-zinc-300">
              {defaultCity.name}
            </span>
          </p>
        )}
        {!defaultCity && (
          <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
            No cities found. Onboard a city first.
          </p>
        )}
      </div>

      {defaultCity ? (
        <AutomationRulesManager cityId={defaultCity.id} initialRules={rules} />
      ) : (
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-12 text-center">
          <p className="text-sm text-zinc-500">
            No city configured. Go to{" "}
            <a href="/admin/onboard" className="text-blue-600 underline">
              Onboarding
            </a>{" "}
            to add one.
          </p>
        </div>
      )}
    </div>
  );
}
