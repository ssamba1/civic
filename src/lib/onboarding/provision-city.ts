// provisionCity — turns a resolved TIGER candidate into a cities row (F4).
// SERVER-ONLY: defaults to the service-role client (createServerClient bypasses
// RLS; `cities` has no write policy). Gate the caller at the /admin route.
//
// Geometry conversion (GeoJSON → geography, single → MULTIPOLYGON) and the
// idempotent ON CONFLICT upsert live in the SQL function `provision_city`
// (migration 015), so this module stays pure orchestration + is unit-testable by
// injecting `db`.

import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import type { Result } from "@/lib/types";
import {
  type BoundaryGeometry,
  type CityCandidate,
  fetchCityBoundary,
  resolveCityCandidates,
  slugify,
  zoomForArea,
} from "./tiger";

const logger = createLogger("provision-city");

type SupabaseLike = ReturnType<typeof createServerClient>;
type FetchLike = typeof fetch;

export interface ProvisionResult {
  cityId: string;
  slug: string;
  /** false when an existing city with this slug was updated instead of created. */
  created: boolean;
  candidate: CityCandidate;
  /** The fetched boundary — reused by cold-start so it isn't fetched twice. */
  boundary: BoundaryGeometry;
}

export interface ProvisionInput {
  candidate: CityCandidate;
  open311JurisdictionId?: string | null;
}

interface ProvisionDeps {
  db?: SupabaseLike;
  fetchImpl?: FetchLike;
}

/**
 * Resolve `{ name, state }` to candidates. Convenience wrapper so callers that
 * already know the city can provision in one step when the match is unambiguous.
 * Returns the candidate list (for the wizard to disambiguate) when 0 or >1 match.
 */
export async function resolveForProvision(
  input: { name: string; state: string },
  fetchImpl: FetchLike = fetch,
): Promise<Result<CityCandidate[]>> {
  return resolveCityCandidates(input, fetchImpl);
}

/**
 * Provision a city from a chosen candidate: fetch its boundary, then upsert the
 * cities row (active=false) via the provision_city RPC. Idempotent on slug.
 */
export async function provisionCity(
  input: ProvisionInput,
  deps: ProvisionDeps = {},
): Promise<Result<ProvisionResult>> {
  const db = deps.db ?? createServerClient();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const { candidate } = input;

  const boundary = await fetchCityBoundary(candidate, fetchImpl);
  if (!boundary.ok) {
    logger.error("boundary_fetch_failed", undefined, {
      geoid: candidate.geoid,
      error: boundary.error,
    });
    return { ok: false, error: `GEOMETRY_FETCH: ${boundary.error}` };
  }

  const slug = slugify(candidate.displayName);
  const zoom = zoomForArea(candidate.areaLandM2);
  // Pass center only when TIGER gave a usable internal point; otherwise let the
  // RPC derive it from the boundary centroid (provision_city handles null).
  const lng = Number.isFinite(candidate.center.lng)
    ? candidate.center.lng
    : null;
  const lat = Number.isFinite(candidate.center.lat)
    ? candidate.center.lat
    : null;

  const { data, error } = await db
    .rpc("provision_city", {
      _slug: slug,
      _name: candidate.displayName,
      _state: candidate.state,
      _boundary: boundary.data,
      _center_lng: lng,
      _center_lat: lat,
      _zoom: zoom,
      _jurisdiction: input.open311JurisdictionId ?? null,
    })
    .single<{ id: string; created: boolean }>();

  if (error || !data) {
    logger.error("provision_rpc_failed", undefined, {
      slug,
      error: error?.message ?? "no data",
    });
    return { ok: false, error: `PROVISION_DB: ${error?.message ?? "no data"}` };
  }

  logger.info("city_provisioned", {
    slug,
    cityId: data.id,
    created: data.created,
    type: candidate.type,
  });
  return {
    ok: true,
    data: {
      cityId: data.id,
      slug,
      created: data.created,
      candidate,
      boundary: boundary.data,
    },
  };
}
