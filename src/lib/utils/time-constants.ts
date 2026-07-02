/* ------------------------------------------------------------------
   Shared millisecond time-unit constants.

   DAY_MS / HOUR_MS were each redeclared locally (identical values) across
   analytics-data.ts, resident-data.ts, dashboard-data.ts, delegation-history.ts,
   filters/filter-reports.ts, filters/derive.ts, and several test files. This
   is the single source of truth.
   ------------------------------------------------------------------ */

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
