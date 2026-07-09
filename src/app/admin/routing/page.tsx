import { Workflow } from "lucide-react";
import Link from "next/link";
import { RoutingFlow } from "@/components/routing/routing-flow";
import { createServerClient } from "@/lib/db/client";
import { fetchRoutingFlowData } from "@/lib/routing/flow-data";
import { cn } from "@/lib/utils/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Routing flow | Civic" };

/** Per-category report volume for the badge overlays. Pilot-scale cities are
 *  a few thousand reports; one column scan is fine for an admin-only page. */
async function fetchCategoryCounts(
  cityId: string,
): Promise<Record<string, number>> {
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("reports")
      .select("category")
      .eq("city_id", cityId);
    if (error || !data) return {};
    const counts: Record<string, number> = {};
    for (const r of data as { category: string | null }[]) {
      if (!r.category) continue;
      counts[r.category] = (counts[r.category] ?? 0) + 1;
    }
    return counts;
  } catch {
    return {};
  }
}

export default async function AdminRoutingPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string }>;
}) {
  const { city: cityParam } = await searchParams;
  const db = createServerClient();
  const { data: cities } = await db
    .from("cities")
    .select("id, name, state")
    .order("name");
  const list = (cities ?? []) as { id: string; name: string; state: string }[];
  const selected = list.find((c) => c.id === cityParam) ?? list[0] ?? null;

  const [flow, counts] = selected
    ? await Promise.all([
        fetchRoutingFlowData(selected.id),
        fetchCategoryCounts(selected.id),
      ])
    : [null, undefined];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6">
      <div className="flex items-center gap-3">
        <Workflow className="h-6 w-6 text-subtle" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Routing flow
          </h1>
          <p className="mt-1 text-sm text-subtle">
            The live dispatch pipeline per city — AI classification through
            divisions (or the org-unit tree) to the crews that do the work.
            Hover any node to trace its paths.
          </p>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="mt-8 rounded-[var(--radius-lg)] border border-hairline bg-surface p-6 text-sm text-subtle">
          No cities onboarded yet. Onboard a city and its routing pipeline
          appears here.
        </p>
      ) : (
        <>
          {/* City picker — plain links so the page stays a server component. */}
          <div className="mt-6 flex flex-wrap gap-1.5">
            {list.map((c) => {
              const active = c.id === selected?.id;
              return (
                <Link
                  key={c.id}
                  href={`/admin/routing?city=${c.id}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
                    active
                      ? "border-foreground/20 bg-overlay text-foreground"
                      : "border-hairline text-subtle hover:bg-overlay hover:text-foreground",
                  )}
                >
                  {c.name}, {c.state}
                </Link>
              );
            })}
          </div>

          {flow && (
            <div className="mt-4">
              <RoutingFlow data={flow} categoryCounts={counts} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
