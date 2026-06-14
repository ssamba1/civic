import { createHash, timingSafeEqual } from "node:crypto";
import { after, type NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { checkRateLimit, clientIp } from "@/lib/ai/rate-limit";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import { getService } from "@/lib/open311/services";
import {
  expandStatus,
  type Open311Request,
  reportToOpen311,
} from "@/lib/open311/transform";
import { toErrorXml, toOpen311Xml } from "@/lib/open311/xml";
import {
  type City,
  type Classification,
  normalizeLocation,
  type Report,
  type ReportStatus,
} from "@/lib/types";

const logger = createLogger("[open311-list]");

/**
 * GET /api/open311/v2/requests
 *
 * Open311 GeoReport v2 — list service requests.
 * Public endpoint. Supports filters: jurisdiction_id, service_code,
 * start_date, end_date, status (open|closed).
 *
 * Content negotiation: ?format=xml → XML, otherwise JSON.
 */

/** Safe columns for public GET — no reporter PII, no raw storage paths */
const PUBLIC_REPORT_SELECT =
  "id, city_id, location, photo_public_url, status, address, created_at, updated_at, classifications(category, severity, confidence, reasoning, is_emergency), cities!inner(id, name, open311_jurisdiction_id)";

export async function GET(request: NextRequest) {
  try {
    // Rate limit: 60 requests/min per IP (generous for public spec clients)
    const rl = checkRateLimit("open311_list:" + clientIp(request), {
      windowMs: 60_000,
      max: 60,
    });
    if (!rl.allowed) {
      return errorResponse(
        429,
        "Rate limit exceeded",
        requestWantsXml(request),
      );
    }

    const params = request.nextUrl.searchParams;
    const jurisdictionId = params.get("jurisdiction_id");
    const serviceCode = params.get("service_code");
    const startDate = params.get("start_date");
    const endDate = params.get("end_date");
    const statusParam = params.get("status");
    const wantsXml = requestWantsXml(request);

    // Reject unknown status values — silently ignoring them violates spec
    if (
      statusParam !== null &&
      statusParam !== "open" &&
      statusParam !== "closed"
    ) {
      return errorResponse(400, "status must be 'open' or 'closed'", wantsXml);
    }
    const status = statusParam as "open" | "closed" | null;

    // Pagination (Open311 spec §4.2: page + page_size, 1-based page)
    const pageRaw = params.get("page");
    const pageSizeRaw = params.get("page_size");
    const page = pageRaw !== null ? Math.max(1, parseInt(pageRaw, 10) || 1) : 1;
    const pageSize =
      pageSizeRaw !== null
        ? Math.min(200, Math.max(1, parseInt(pageSizeRaw, 10) || 100))
        : 200;
    const rangeFrom = (page - 1) * pageSize;
    const rangeTo = rangeFrom + pageSize - 1;

    const db = createServerClient();

    // Select only safe public columns — no description, no photo_raw_url, no reporter PII
    let query = db.from("reports").select(PUBLIC_REPORT_SELECT);

    // Filter by jurisdiction if provided
    if (jurisdictionId) {
      query = query.eq("cities.open311_jurisdiction_id", jurisdictionId);
    }

    // Filter by service_code (= category on classifications)
    if (serviceCode) {
      query = query.eq("classifications.category", serviceCode);
    }

    // Filter by Open311 status — expand to internal status values
    if (status === "open" || status === "closed") {
      query = query.in("status", expandStatus(status));
    }

    // Date range filters on created_at
    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    // Exclude rejected (and merged) reports from the public feed — H13
    query = query.not("status", "in", '("rejected","merged")');

    query = query
      .order("created_at", { ascending: false })
      .range(rangeFrom, rangeTo);

    const { data, error } = await query;

    if (error) {
      logger.error("Database query failed", error);
      return errorResponse(500, "Database query failed", wantsXml);
    }

    // Validate row shape before transformation
    const RowSchema = z
      .object({
        id: z.string(),
        city_id: z.string(),
        location: z.unknown(),
        photo_public_url: z.string(),
        status: z.string(),
        address: z.string().nullable(),
        created_at: z.string(),
        updated_at: z.string(),
        classifications: z.array(z.unknown()).nullable(),
        cities: z.array(z.unknown()).nullable(),
      })
      .passthrough();

    // Transform rows to Open311 format
    const open311Requests = (data ?? [])
      .map((row) => {
        const validated = RowSchema.safeParse(row);
        if (!validated.success) {
          logger.error("Open311 row schema mismatch", {
            row,
            issues: validated.error.issues,
          });
          return null;
        }
        const v = validated.data;
        const report = rowToReport(v as ReportRow);
        const classification: Classification | null =
          v.classifications != null
            ? ((v.classifications[0] ?? null) as Classification | null)
            : null;
        const city =
          Array.isArray(v.cities) && v.cities.length > 0
            ? (v.cities[0] as City)
            : (v.cities as City | null);
        return city ? reportToOpen311(report, classification, city) : null;
      })
      // Type-guard filter so the result is Open311Request[], not
      // (Open311Request | null)[] — Boolean alone doesn't narrow out null.
      .filter((r): r is Open311Request => r !== null);

    if (wantsXml) {
      return new NextResponse(toOpen311Xml(open311Requests), {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    return NextResponse.json(open311Requests);
  } catch (err) {
    logger.error("GET /requests unhandled error", err);
    return errorResponse(
      500,
      "Internal server error",
      requestWantsXml(request),
    );
  }
}

/**
 * POST /api/open311/v2/requests
 *
 * Open311 GeoReport v2 — create a new service request.
 * Requires api_key param. Body: service_code, lat, long,
 * address_string, description, media_url.
 *
 * Auth: validated against OPEN311_API_KEY env var.
 * City resolution: uses jurisdiction_id param → cities.open311_jurisdiction_id,
 * or falls back to first active city.
 * Reporter: uses OPEN311_SYSTEM_USER_ID env var as the reporter for
 * externally-submitted requests. Wire a real user lookup later.
 */
export async function POST(request: NextRequest) {
  const wantsXml = requestWantsXml(request);

  try {
    // Parse body (supports both JSON and form-encoded)
    let body: Record<string, string>;
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries()) as Record<string, string>;
    }

    // Validate API key — constant-time comparison to prevent timing attacks (H10)
    const apiKey = body.api_key ?? request.nextUrl.searchParams.get("api_key");
    const expectedKey = process.env.OPEN311_API_KEY;
    if (!expectedKey || !apiKey || !safeCompare(apiKey, expectedKey)) {
      return errorResponse(
        401,
        "API key is required and must be valid",
        wantsXml,
      );
    }

    // Validate required fields
    const serviceCode = body.service_code;
    if (!serviceCode || !getService(serviceCode)) {
      return errorResponse(
        400,
        `Invalid or missing service_code. Use GET /services for valid codes.`,
        wantsXml,
      );
    }

    const lat = parseFloat(body.lat);
    const lng = parseFloat(body.long);
    if (isNaN(lat) || isNaN(lng)) {
      return errorResponse(
        400,
        "lat and long are required numeric fields",
        wantsXml,
      );
    }
    if (lat < -90 || lat > 90) {
      return errorResponse(400, "lat must be between -90 and 90", wantsXml);
    }
    if (lng < -180 || lng > 180) {
      return errorResponse(400, "long must be between -180 and 180", wantsXml);
    }

    const description = body.description ?? null;
    if (description && description.length > 2000) {
      return errorResponse(
        400,
        "description must be 2000 characters or fewer",
        wantsXml,
      );
    }
    const addressString = body.address_string ?? null;
    if (addressString && addressString.length > 300) {
      return errorResponse(
        400,
        "address_string must be 300 characters or fewer",
        wantsXml,
      );
    }

    const db = createServerClient();

    // Resolve city from jurisdiction_id or default to first active city
    const jurisdictionId =
      body.jurisdiction_id ??
      request.nextUrl.searchParams.get("jurisdiction_id");

    let city: City;
    if (jurisdictionId) {
      const { data, error } = await db
        .from("cities")
        .select("*")
        .eq("open311_jurisdiction_id", jurisdictionId)
        .eq("active", true)
        .single();

      if (error || !data) {
        return errorResponse(400, "Unknown jurisdiction_id", wantsXml);
      }
      city = data as City;
    } else {
      const { data, error } = await db
        .from("cities")
        .select("*")
        .eq("active", true)
        .limit(1)
        .single();

      if (error || !data) {
        return errorResponse(500, "No active city configured", wantsXml);
      }
      city = data as City;
    }

    // Reporter ID — use system user for external Open311 submissions.
    // TODO: Replace with a real api_key → user lookup table.
    const reporterId = process.env.OPEN311_SYSTEM_USER_ID;
    if (!reporterId) {
      return errorResponse(
        500,
        "Server misconfigured: OPEN311_SYSTEM_USER_ID not set",
        wantsXml,
      );
    }

    // Validate media_url — must be https if provided (prevent XSS/tracking-pixel injection)
    const mediaUrl = body.media_url ?? "";
    if (mediaUrl) {
      try {
        const parsed = new URL(mediaUrl);
        if (parsed.protocol !== "https:") {
          return errorResponse(400, "media_url must use https://", wantsXml);
        }
      } catch {
        return errorResponse(400, "media_url must be a valid URL", wantsXml);
      }
    }

    // Insert the report
    const { data: report, error: insertError } = await db
      .from("reports")
      .insert({
        city_id: city.id,
        reporter_id: reporterId,
        location: `SRID=4326;POINT(${lng} ${lat})`,
        photo_public_url: mediaUrl,
        photo_raw_url: null,
        status: "open" as const,
        address: addressString,
        description: description,
      })
      .select()
      .single();

    if (insertError || !report) {
      logger.error("Report insert failed", insertError);
      return errorResponse(500, "Failed to create service request", wantsXml);
    }

    // Trigger AI classification async — fire-and-forget (H2)
    // x-internal-key allows classify route to accept calls without a user session
    const classifyHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (process.env.INTERNAL_CLASSIFY_SECRET) {
      classifyHeaders["x-internal-key"] = process.env.INTERNAL_CLASSIFY_SECRET;
    }
    after(() =>
      fetch(
        `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/api/ai/classify`,
        {
          method: "POST",
          headers: classifyHeaders,
          body: JSON.stringify({ report_id: report.id }),
        },
      ).catch((err) => {
        logger.error("Classify trigger failed", err, { reportId: report.id });
      }),
    );

    // Return Open311 POST response — token = service_request_id for simplicity
    const responseBody = [
      {
        service_request_id: report.id,
        token: report.id,
        service_notice:
          "Request submitted. You can track status using the service_request_id.",
      },
    ];

    if (wantsXml) {
      const xml = [
        '<?xml version="1.0" encoding="utf-8"?>',
        "<service_requests>",
        "  <request>",
        `    <service_request_id>${escXml(report.id)}</service_request_id>`,
        `    <token>${escXml(report.id)}</token>`,
        "    <service_notice>Request submitted. You can track status using the service_request_id.</service_notice>",
        "  </request>",
        "</service_requests>",
      ].join("\n");
      return new NextResponse(xml, {
        status: 201,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    return NextResponse.json(responseBody, { status: 201 });
  } catch (err) {
    logger.error("POST /requests unhandled error", err);
    return errorResponse(500, "Internal server error", wantsXml);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Constant-time string comparison — prevents timing oracle on API key check. */
function safeCompare(a: string, b: string): boolean {
  // Hash both sides to fixed-length digests so an unequal-length guess takes the
  // same path as an equal-length one (no early-exit length oracle).
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}

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

function escXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
