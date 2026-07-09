import "server-only";

import { createLogger } from "@/lib/logger";

/* ==================================================================
   Outbound CMMS/ERP/GIS connectors (NEXT_100 #74 #75 #76 #77 #78).

   Wedge W5 — integrate, don't replace. Civic is the modern intake + public
   accountability layer feeding the systems cities already run. Each connector
   maps a Civic status event to that vendor's shape and POSTs it, gated on the
   vendor's own env credentials — absent creds → the connector is simply skipped,
   so this ships dark and lights up per-city as creds are provided.

   These are SCAFFOLDS: the endpoint + auth are wired and the payload is mapped
   to each vendor's documented request shape, but the exact field names should be
   confirmed against a live sandbox before production use (marked per connector).

   Config (per connector, all optional):
     CITYWORKS_URL / CITYWORKS_TOKEN
     ACCELA_URL    / ACCELA_TOKEN
     TYLER_URL     / TYLER_TOKEN
     SALESFORCE_URL/ SALESFORCE_TOKEN
     ARCGIS_FEATURE_URL / ARCGIS_TOKEN   (Esri feature-layer applyEdits)
   ================================================================== */

const logger = createLogger("[connectors]");
const TIMEOUT_MS = 6000;

export interface ConnectorEvent {
  event: string; // e.g. "report.closed"
  reportId: string;
  status: string;
  category?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  occurredAt: string;
}

interface Connector {
  name: string;
  /** Returns the [url, requestInit] to POST, or null when unconfigured. */
  build: (e: ConnectorEvent) => { url: string; init: RequestInit } | null;
}

function bearer(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// NOTE: payload field names are best-effort per public docs — confirm against a
// vendor sandbox before go-live.
const CONNECTORS: Connector[] = [
  {
    name: "cityworks",
    build: (e) => {
      const url = process.env.CITYWORKS_URL;
      const token = process.env.CITYWORKS_TOKEN;
      if (!url || !token) return null;
      return {
        url: `${url.replace(/\/$/, "")}/services/WorkOrder/Create`,
        init: {
          method: "POST",
          headers: bearer(token),
          body: JSON.stringify({
            Description: `Civic ${e.category ?? "issue"} — ${e.status}`,
            Location: e.address ?? undefined,
            X: e.lng ?? undefined,
            Y: e.lat ?? undefined,
            ExternalId: e.reportId,
          }),
        },
      };
    },
  },
  {
    name: "accela",
    build: (e) => {
      const url = process.env.ACCELA_URL;
      const token = process.env.ACCELA_TOKEN;
      if (!url || !token) return null;
      return {
        url: `${url.replace(/\/$/, "")}/v4/records`,
        init: {
          method: "POST",
          headers: bearer(token),
          body: JSON.stringify({
            type: { value: e.category ?? "ServiceRequest" },
            description: `Civic report ${e.reportId} (${e.status})`,
            address: e.address ?? undefined,
            customId: e.reportId,
          }),
        },
      };
    },
  },
  {
    name: "tyler",
    build: (e) => {
      const url = process.env.TYLER_URL;
      const token = process.env.TYLER_TOKEN;
      if (!url || !token) return null;
      return {
        url: `${url.replace(/\/$/, "")}/api/serviceRequests`,
        init: {
          method: "POST",
          headers: bearer(token),
          body: JSON.stringify({
            category: e.category ?? "other",
            status: e.status,
            externalReference: e.reportId,
            location: e.address ?? undefined,
          }),
        },
      };
    },
  },
  {
    name: "salesforce",
    build: (e) => {
      const url = process.env.SALESFORCE_URL;
      const token = process.env.SALESFORCE_TOKEN;
      if (!url || !token) return null;
      return {
        url: `${url.replace(/\/$/, "")}/services/data/v60.0/sobjects/Case`,
        init: {
          method: "POST",
          headers: bearer(token),
          body: JSON.stringify({
            Subject: `Civic ${e.category ?? "issue"}`,
            Status: e.status,
            Description: `Civic report ${e.reportId}`,
            Civic_External_Id__c: e.reportId,
          }),
        },
      };
    },
  },
  {
    name: "arcgis",
    build: (e) => {
      const url = process.env.ARCGIS_FEATURE_URL;
      const token = process.env.ARCGIS_TOKEN;
      if (!url || !token || e.lat == null || e.lng == null) return null;
      // Esri feature-layer applyEdits (adds) — form-encoded, token in body.
      const adds = JSON.stringify([
        {
          geometry: { x: e.lng, y: e.lat, spatialReference: { wkid: 4326 } },
          attributes: {
            report_id: e.reportId,
            category: e.category ?? "other",
            status: e.status,
          },
        },
      ]);
      return {
        url: `${url.replace(/\/$/, "")}/applyEdits`,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ adds, f: "json", token }).toString(),
        },
      };
    },
  },
];

/**
 * Fan a status event out to every configured connector. Best-effort and
 * parallel; unconfigured connectors are skipped, failures are logged and never
 * propagate. Returns the names that were delivered.
 */
export async function syncToConnectors(e: ConnectorEvent): Promise<string[]> {
  const active = CONNECTORS.map((c) => ({ c, req: c.build(e) })).filter(
    (x): x is { c: Connector; req: { url: string; init: RequestInit } } =>
      x.req !== null,
  );
  if (active.length === 0) return [];

  const delivered: string[] = [];
  await Promise.all(
    active.map(async ({ c, req }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(req.url, {
          ...req.init,
          signal: controller.signal,
        });
        if (res.ok) delivered.push(c.name);
        else
          logger.warn("connector_non_ok", {
            connector: c.name,
            status: res.status,
          });
      } catch (err) {
        logger.warn("connector_failed", {
          connector: c.name,
          detail: err instanceof Error ? err.message : String(err),
        });
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  return delivered;
}
