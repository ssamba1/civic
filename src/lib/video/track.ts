/**
 * GPS track interpolation for moving cameras (dashcam clips). A clip may
 * carry video_clips.gps_track = [{t, lng, lat}] (t in seconds from clip
 * start); each sampled frame's location is linearly interpolated from the
 * bracketing track points. Pure functions.
 */
import type { GeoPoint } from "@/lib/types";

export interface TrackPoint {
  /** Seconds from clip start. */
  t: number;
  lng: number;
  lat: number;
}

/** Validate/normalize an untrusted gps_track jsonb value. Bad rows dropped. */
export function parseTrack(raw: unknown): TrackPoint[] {
  if (!Array.isArray(raw)) return [];
  const points: TrackPoint[] = [];
  for (const p of raw) {
    if (typeof p !== "object" || p === null) continue;
    const { t, lng, lat } = p as Record<string, unknown>;
    const tN = Number(t);
    const lngN = Number(lng);
    const latN = Number(lat);
    if (
      !Number.isFinite(tN) ||
      !Number.isFinite(lngN) ||
      !Number.isFinite(latN)
    )
      continue;
    if (lngN < -180 || lngN > 180 || latN < -90 || latN > 90) continue;
    points.push({ t: tN, lng: lngN, lat: latN });
  }
  return points.sort((a, b) => a.t - b.t);
}

/**
 * Location at `t` seconds: linear interpolation between the bracketing track
 * points, clamped to the ends. Null for an empty track.
 */
export function interpolateTrack(
  track: readonly TrackPoint[],
  t: number,
): GeoPoint | null {
  if (track.length === 0) return null;
  if (t <= track[0].t) return { lng: track[0].lng, lat: track[0].lat };
  const last = track[track.length - 1];
  if (t >= last.t) return { lng: last.lng, lat: last.lat };
  for (let i = 1; i < track.length; i++) {
    if (t <= track[i].t) {
      const a = track[i - 1];
      const b = track[i];
      const span = b.t - a.t;
      const f = span > 0 ? (t - a.t) / span : 0;
      return {
        lng: a.lng + (b.lng - a.lng) * f,
        lat: a.lat + (b.lat - a.lat) * f,
      };
    }
  }
  return { lng: last.lng, lat: last.lat };
}
