/** Spatial tolerance for footprint matching. A road centerline is not the pothole. */
export const MATCH_TOLERANCE_M = 15;
/** Camera detection clustering radius, GPS error on a moving vehicle. */
export const CLUSTER_RADIUS_M = 8;
/** Promote a cluster to a report after N passes on >= MIN_DISTINCT_DAYS days. */
export const PROMOTE_MIN_PASSES = 3;
export const PROMOTE_MIN_DISTINCT_DAYS = 2;
/** Category → compatible capital job types (zero-score any other pairing). */
export const CATEGORY_JOB_COMPAT: Record<string, string[]> = {
  pothole: ["resurfacing"],
  sidewalk_damage: ["sidewalk"],
  streetlight: ["streetlight"],
  faded_signage: ["other"],
  drainage: ["resurfacing", "other"],
};
