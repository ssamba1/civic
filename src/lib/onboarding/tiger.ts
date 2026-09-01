// Census TIGERweb client, resolves a city/county name to authoritative US
// boundary candidates + fetches the boundary polygon. The engine wizard Step 1
// drives (F4). Verified against the live service 2026-06-14:
//   - names carry LSAD suffixes (" city" / " County" / "unified government" …)
//   - cities span layers: Incorporated Places (4), Consolidated Cities (3),
//     CDPs (5), Counties (State_County/1), so resolution is multi-layer.
// No DB dependency; pure HTTP. `fetchImpl` is injectable for tests.

import type { Result } from "@/lib/types";
import { normalizeState } from "./state-fips";

const TIGER_BASE =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb";

export type CityCandidateType = "place" | "consolidated" | "cdp" | "county";

interface TigerLayer {
  url: string;
  type: CityCandidateType;
}

// Queried in this order; results are deduped by GEOID keeping the first hit, so
// a consolidated gov listed in both layer 3 and 4 resolves to its layer-3 entry.
const TIGER_LAYERS: readonly TigerLayer[] = [
  {
    url: `${TIGER_BASE}/Places_CouSub_ConCity_SubMCD/MapServer/4`,
    type: "place",
  },
  {
    url: `${TIGER_BASE}/Places_CouSub_ConCity_SubMCD/MapServer/3`,
    type: "consolidated",
  },
  {
    url: `${TIGER_BASE}/Places_CouSub_ConCity_SubMCD/MapServer/5`,
    type: "cdp",
  },
  { url: `${TIGER_BASE}/State_County/MapServer/1`, type: "county" },
];

export interface CityCandidate {
  /** Raw TIGER NAME, e.g. "Cumming city", "Chatham County". */
  name: string;
  /** Cleaned for display + slug, e.g. "Cumming", "Chatham County". */
  displayName: string;
  type: CityCandidateType;
  geoid: string;
  /** TIGER layer this came from, reused to fetch its geometry. */
  layerUrl: string;
  /** 2-letter state abbreviation, echoed from input. */
  state: string;
  stateFips: string;
  areaLandM2: number;
  /** Internal point (INTPTLON/INTPTLAT). lng/lat may be NaN if TIGER omits them. */
  center: { lng: number; lat: number };
}

export type BoundaryGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown;
};

type FetchLike = typeof fetch;

// --- helpers (exported for unit tests) ---------------------------------------

/** Strip the trailing LSAD descriptor so "Cumming city" → "Cumming". Keeps
 *  "… County" (meaningful for county/consolidated tenants). */
export function cleanCityName(raw: string): string {
  return raw
    .replace(/\s*\(balance\)\s*$/i, "")
    .replace(
      /\s+(unified|consolidated|metro(?:politan)?)\s+government\s*$/i,
      "",
    )
    .replace(/\s+(city|town|village|borough|municipality|CDP)\s*$/i, "")
    .trim();
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Default map zoom from land area (m²). Heuristic seed; the map still
 *  fitBounds() to the boundary on first load. */
export function zoomForArea(areaLandM2: number): number {
  if (!Number.isFinite(areaLandM2) || areaLandM2 <= 0) return 12;
  const km2 = areaLandM2 / 1e6;
  if (km2 < 25) return 14;
  if (km2 < 75) return 13;
  if (km2 < 200) return 12;
  if (km2 < 600) return 11;
  if (km2 < 2000) return 10;
  return 9;
}

// PostgREST/ArcGIS where-clause string literal: double single-quotes.
function sqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

// --- resolution --------------------------------------------------------------

interface TigerAttributes {
  NAME?: string;
  GEOID?: string;
  INTPTLAT?: string;
  INTPTLON?: string;
  AREALAND?: string | number;
}

async function queryLayer(
  layer: TigerLayer,
  name: string,
  fips: string,
  abbr: string,
  fetchImpl: FetchLike,
): Promise<CityCandidate[]> {
  const where = `UPPER(NAME) LIKE '${sqlLiteral(name.toUpperCase())}%' AND STATE='${fips}'`;
  const qs = new URLSearchParams({
    where,
    outFields: "NAME,GEOID,INTPTLAT,INTPTLON,AREALAND",
    returnGeometry: "false",
    f: "json",
  });
  const res = await fetchImpl(`${layer.url}/query?${qs.toString()}`);
  if (!res.ok) throw new Error(`TIGER HTTP ${res.status}`);
  const json = (await res.json()) as {
    features?: { attributes: TigerAttributes }[];
  };
  const features = json.features ?? [];
  const out: CityCandidate[] = [];
  for (const f of features) {
    const a = f.attributes ?? {};
    if (!a.NAME || !a.GEOID) continue;
    out.push({
      name: a.NAME,
      displayName: cleanCityName(a.NAME),
      type: layer.type,
      geoid: a.GEOID,
      layerUrl: layer.url,
      state: abbr,
      stateFips: fips,
      areaLandM2: Number(a.AREALAND ?? 0),
      center: { lng: Number(a.INTPTLON), lat: Number(a.INTPTLAT) },
    });
  }
  return out;
}

/**
 * Find authoritative boundary candidates for `{ name, state }` across all TIGER
 * layers. Returns [] (not an error) when nothing matches. The caller treats an
 * empty list as NO_MATCH and offers the manual-boundary fallback. Errors only
 * when the state is unknown or every layer query fails.
 */
export async function resolveCityCandidates(
  input: { name: string; state: string },
  fetchImpl: FetchLike = fetch,
): Promise<Result<CityCandidate[]>> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "City name is required" };
  const st = normalizeState(input.state);
  if (!st) return { ok: false, error: `Unknown state: ${input.state}` };

  const settled = await Promise.allSettled(
    TIGER_LAYERS.map((layer) =>
      queryLayer(layer, name, st.fips, st.abbr, fetchImpl),
    ),
  );

  if (settled.every((r) => r.status === "rejected")) {
    return { ok: false, error: "TIGER lookup failed for every layer" };
  }

  const seen = new Set<string>();
  const candidates: CityCandidate[] = [];
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    for (const c of r.value) {
      if (seen.has(c.geoid)) continue;
      seen.add(c.geoid);
      candidates.push(c);
    }
  }

  // Smallest land area first → the most specific match leads (city before county).
  candidates.sort((a, b) => a.areaLandM2 - b.areaLandM2);
  return { ok: true, data: candidates };
}

/**
 * Fetch the boundary polygon for a resolved candidate as GeoJSON (Polygon or
 * MultiPolygon), in WGS84 (`outSR=4326`, `f=geojson` → no esri-ring winding fix).
 */
export async function fetchCityBoundary(
  candidate: Pick<CityCandidate, "layerUrl" | "geoid">,
  fetchImpl: FetchLike = fetch,
): Promise<Result<BoundaryGeometry>> {
  const qs = new URLSearchParams({
    where: `GEOID='${sqlLiteral(candidate.geoid)}'`,
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });
  let json: { features?: { geometry?: BoundaryGeometry }[] };
  try {
    const res = await fetchImpl(`${candidate.layerUrl}/query?${qs.toString()}`);
    if (!res.ok)
      return { ok: false, error: `TIGER geometry HTTP ${res.status}` };
    json = (await res.json()) as typeof json;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "TIGER geometry fetch failed",
    };
  }
  const geom = json.features?.[0]?.geometry;
  if (!geom || (geom.type !== "Polygon" && geom.type !== "MultiPolygon")) {
    return { ok: false, error: "No polygon geometry returned for GEOID" };
  }
  return { ok: true, data: geom };
}
