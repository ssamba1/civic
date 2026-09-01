import { createLogger } from "@/lib/logger";
import {
  CITY_CENTER,
  LOOKBACK_HOURS,
  NWS_TIMEOUT_MS,
  NWS_USER_AGENT,
} from "./storm-config";

const logger = createLogger("[nws-client]");

export interface NwsAlert {
  id: string;
  event: string;
  severity: string;
  headline: string | null;
  areaDesc: string;
  effective: string;
  expires: string;
  status: "active" | "expired";
}

interface NwsFeatureProperties {
  id?: string;
  event?: string;
  severity?: string;
  headline?: string | null;
  areaDesc?: string;
  effective?: string;
  expires?: string;
}

interface NwsFeature {
  properties?: NwsFeatureProperties;
}

interface NwsAlertsResponse {
  features?: NwsFeature[];
}

/**
 * Fetch NWS alerts that were in effect for the city's coordinates within the
 * lookback window (covers both currently-active and recently-expired severe
 * weather, so the advisory keeps showing after a storm passes). Fails soft:
 * any network/parse error returns an empty list rather than throwing. This
 * feature must never break the staff console.
 */
export async function fetchRecentAlerts(
  point: { lat: number; lng: number } = CITY_CENTER,
): Promise<NwsAlert[]> {
  const start = new Date(
    Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const url = `https://api.weather.gov/alerts?point=${point.lat},${point.lng}&start=${encodeURIComponent(start)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NWS_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": NWS_USER_AGENT,
        Accept: "application/geo+json",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      logger.warn("nws_request_failed", { status: res.status });
      return [];
    }

    const body = (await res.json()) as NwsAlertsResponse;
    const now = Date.now();

    return (body.features ?? [])
      .map((f) => f.properties)
      .filter(
        (p): p is NwsFeatureProperties & { event: string; expires: string } =>
          !!p && !!p.event && !!p.expires,
      )
      .map((p) => ({
        id: p.id ?? `${p.event}-${p.effective}`,
        event: p.event,
        severity: p.severity ?? "Unknown",
        headline: p.headline ?? null,
        areaDesc: p.areaDesc ?? "",
        effective: p.effective ?? "",
        expires: p.expires,
        status: (new Date(p.expires).getTime() >= now ? "active" : "expired") as
          | "active"
          | "expired",
      }));
  } catch (err) {
    logger.warn("nws_fetch_error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
