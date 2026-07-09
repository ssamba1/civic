import "server-only";

import type { DashboardReport } from "@/lib/dashboard-data";
import { getReportCorpus, KNOWN_CITIES } from "@/lib/dashboard-data";
import {
  fetchCity,
  fetchCorpus,
  PREVIEW_SOURCES,
} from "@/lib/dashboard-queries";
import { DEMO_MODE } from "@/lib/demo-mode";

/**
 * Resolve a city's report corpus the same way the team/city layouts do: the
 * in-memory demo corpus for a known demo city, else the live per-city fetch.
 * Returns null when the slug resolves to no city (caller should notFound()).
 * Shared by the standalone analytics pages (leaderboard, hotspots) so they
 * don't each re-derive this branch.
 */
export async function corpusForCity(
  slug: string,
): Promise<{ name: string; state: string; corpus: DashboardReport[] } | null> {
  if (DEMO_MODE && slug in KNOWN_CITIES) {
    const known = KNOWN_CITIES[slug];
    return { name: known.name, state: known.state, corpus: getReportCorpus() };
  }
  const city = await fetchCity(slug);
  if (!city) return null;
  const corpus = await fetchCorpus(
    city.id,
    city.active ? undefined : PREVIEW_SOURCES,
  );
  return { name: city.name, state: city.state, corpus };
}
