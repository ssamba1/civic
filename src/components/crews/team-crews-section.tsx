import { CrewStatCard } from "@/components/crews/crew-stat-card";
import type { CrewTypeDef } from "@/lib/crew-types";
import type { CrewWorkload } from "@/lib/db/crew-workloads";
import type { CrewRow } from "@/lib/db/crews";

/* ==================================================================
   Read-only crew breakdown for a division, rendered under the team
   dashboard. Server component (no interactivity): plain CrewStatCards
   with no edit affordance, plus a heading + count matching the
   members-page crews panel.
   ================================================================== */

export function TeamCrewsSection({
  crews,
  workloads,
  slug,
  crewTypes,
}: {
  crews: CrewRow[];
  workloads: Record<string, CrewWorkload>;
  slug: string;
  crewTypes: CrewTypeDef[];
}) {
  return (
    <section className="mt-8 flex flex-col gap-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
          Crews in this division
        </h2>
        <span className="text-[13px] tabular-nums text-faint">
          {crews.length}
        </span>
      </div>

      {crews.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface px-6 py-10 text-center shadow-[var(--shadow-card)]">
          <p className="text-[13px] text-faint">
            No crews in this division yet, create them from the Members page.
          </p>
        </div>
      ) : (
        // Crew stats come from real work_orders and may not match the synthetic
        // demo-corpus totals shown in the dashboard above.
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {crews.map((c) => (
            <CrewStatCard
              key={c.id}
              crew={c}
              workload={workloads[c.id]}
              slug={slug}
              crewTypes={crewTypes}
            />
          ))}
        </div>
      )}
    </section>
  );
}
