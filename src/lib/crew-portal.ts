import { CATEGORY_CREW_TYPES } from "@/lib/ai/work-order-rules";
import { crewTypeLabel, DEFAULT_CREW_TYPE_KEYS } from "@/lib/crew-types";
import type { ReportCategory } from "@/lib/types";

/** Report categories whose rules-engine dispatch lands on this crew type. */
export function categoriesForCrewType(crewType: string): ReportCategory[] {
  return (
    Object.entries(CATEGORY_CREW_TYPES) as [ReportCategory, string | null][]
  )
    .filter(([, c]) => c === crewType)
    .map(([cat]) => cat);
}

/** Valid portal slugs = the built-in crew types (city customs have no rules
 *  categories yet, so a portal for them would always be empty). */
export function isPortalCrewType(v: string): boolean {
  return (DEFAULT_CREW_TYPE_KEYS as readonly string[]).includes(v);
}

export function portalLabel(crewType: string): string {
  return crewTypeLabel(crewType) ?? crewType;
}
