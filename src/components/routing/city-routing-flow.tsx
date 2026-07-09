"use client";

import { RoutingFlow } from "@/components/routing/routing-flow";
import { useFilteredReports } from "@/lib/filters/context";
import type { RoutingFlowData } from "@/lib/routing/flow-data";

/**
 * City-view binding for the routing flow chart: category volume badges come
 * from the live report corpus (FilterProvider, same source as every other
 * city surface), so the chart breathes with the dashboard instead of
 * re-querying the DB.
 */
export function CityRoutingFlow({
  slug,
  data,
}: {
  slug: string;
  data: RoutingFlowData;
}) {
  const reports = useFilteredReports();

  const categoryCounts: Record<string, number> = {};
  for (const r of reports) {
    categoryCounts[r.category] = (categoryCounts[r.category] ?? 0) + 1;
  }

  return (
    <RoutingFlow
      data={data}
      categoryCounts={categoryCounts}
      crewLinkBase={`/city/${slug}/crew`}
    />
  );
}
