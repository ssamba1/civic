/**
 * Scripted bus route for the camera demo page. A handful of waypoints inside
 * the Cumming seed boundary (-84.16..-84.10, 34.18..34.24); the demo maps
 * video playback time onto distance along this polyline so the bus marker and
 * every dropped pin land on plausible city streets.
 *
 * Demo-only theater: real ingest gets GPS from the vehicle (spec §4.2).
 */

export interface LngLat {
  lng: number;
  lat: number;
}

export const BUS_ROUTE: LngLat[] = [
  { lng: -84.1512, lat: 34.1968 },
  { lng: -84.1462, lat: 34.2004 },
  { lng: -84.1421, lat: 34.2041 },
  { lng: -84.1384, lat: 34.2073 }, // downtown Cumming (seed center)
  { lng: -84.1341, lat: 34.2109 },
  { lng: -84.1296, lat: 34.2151 },
  { lng: -84.1247, lat: 34.2189 },
];

/** Equirectangular segment length — fine at city scale, demo purposes only. */
function segLen(a: LngLat, b: LngLat): number {
  const kx = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const dx = (b.lng - a.lng) * kx;
  const dy = b.lat - a.lat;
  return Math.sqrt(dx * dx + dy * dy);
}

const LENGTHS = BUS_ROUTE.slice(1).map((p, i) => segLen(BUS_ROUTE[i], p));
const TOTAL = LENGTHS.reduce((s, l) => s + l, 0);

/** Position along the route at t in [0,1] (t clamped). */
export function positionAt(t: number): LngLat {
  const target = Math.min(Math.max(t, 0), 1) * TOTAL;
  let walked = 0;
  for (let i = 0; i < LENGTHS.length; i++) {
    if (walked + LENGTHS[i] >= target) {
      const f = LENGTHS[i] === 0 ? 0 : (target - walked) / LENGTHS[i];
      const a = BUS_ROUTE[i];
      const b = BUS_ROUTE[i + 1];
      return {
        lng: a.lng + (b.lng - a.lng) * f,
        lat: a.lat + (b.lat - a.lat) * f,
      };
    }
    walked += LENGTHS[i];
  }
  return BUS_ROUTE[BUS_ROUTE.length - 1];
}

export const ROUTE_CENTER: LngLat = { lng: -84.138, lat: 34.2078 };
