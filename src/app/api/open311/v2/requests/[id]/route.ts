import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import { checkRateLimit, clientIp } from "@/lib/ai/rate-limit";
import { reportToOpen311 } from "@/lib/open311/transform";
import { toOpen311SingleXml, toErrorXml } from "@/lib/open311/xml";
import { normalizeLocation, type Report, type Classification, type City, type ReportStatus } from "@/lib/types";

const logger = createLogger("[open311-get]");

// UUID v4 regex — reject obviously invalid IDs before hitting the DB
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Safe columns for public GET — no reporter PII, no raw storage paths */
const PUBLIC_REPORT_SELECT =
  "id, city_id, location, photo_public_url, status, address, created_at, updated_at, classifications(category, severity, confidence, reasoning, is_emergency), cities!inner(id, name, open311_jurisdiction_id)";

/**
 * GET /api/open311/v2/requests/[id]
 *
 * Open311 GeoReport v2 — get a single service request by ID.
 * Public endpoint.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const wantsXml = requestWantsXml(request);

  try {
    // Rate limit: 60 requests/min per IP
    const rl = checkRateLimit("open311_get:" + clientIp(request), {
      windowMs: 60_000,
      max: 60,
    });
    if (!rl.allowed) {
      return errorResponse(429, "Rate limit exceeded", wantsXml);
    }

    const { id } = await params;

    // Validate UUID format before DB lookup to avoid reflected-input in error bodies
    if (!UUID_RE.test(id)) {
      return errorResponse(404, "Service request not found", wantsXml);
    }

    const db = createServerClient();

    const { data: row, error } = await db
      .from("reports")
      .select(PUBLIC_REPORT_SELECT)
      .eq("id", id)
      .single();

    if (error || !row) {
      return errorResponse(404, "Service request not found", wantsXml);
    }

    const report = rowToReport(row as ReportRow);
    const classification: Classification | null =
      (row as Record<string, unknown[]>).classifications?.[0] as Classification | null ?? null;
    const cityRaw = (row as Record<string, unknown>).cities;
    const city = (Array.isArray(cityRaw) ? cityRaw[0] : cityRaw) as City;

    const open311Request = reportToOpen311(report, classification, city);

    if (wantsXml) {
      return new NextResponse(toOpen311SingleXml(open311Request), {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    return NextResponse.json([open311Request]);
  } catch (err) {
    logger.error("GET /requests/[id] unhandled error", err);
    return errorResponse(500, "Internal server error", wantsXml);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requestWantsXml(request: NextRequest): boolean {
  const format = request.nextUrl.searchParams.get("format");
  if (format === "xml") return true;
  if (format === "json") return false;
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/xml") || accept.includes("application/xml");
}

function errorResponse(code: number, description: string, xml: boolean) {
  if (xml) {
    return new NextResponse(toErrorXml(code, description), {
      status: code,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  }
  return NextResponse.json([{ code, description }], { status: code });
}

// Only safe public columns are fetched — no description, no photo_raw_url, no reporter_id
type ReportRow = {
  id: string;
  city_id: string;
  location: unknown;
  photo_public_url: string;
  status: string;
  address: string | null;
  created_at: string;
  updated_at: string;
};

function rowToReport(row: ReportRow): Report {
  return {
    id: row.id,
    city_id: row.city_id,
    reporter_id: "",
    location: normalizeLocation(row.location) ?? { lat: 0, lng: 0 },
    photo_public_url: row.photo_public_url,
    photo_raw_url: null,
    status: row.status as ReportStatus,
    address: row.address,
    description: null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
