import { createHash, timingSafeEqual } from "node:crypto";
import { after, type NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { runClassifyPipeline } from "@/lib/ai/classify-pipeline";
import { checkRateLimit, clientIp } from "@/lib/ai/rate-limit";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import { lookupApiKey } from "@/lib/open311/api-keys";
import { wantsXml as negotiateXml, open311Error } from "@/lib/open311/http";
import { getService } from "@/lib/open311/services";
import {
  expandStatus,
  firstEmbed,
  type Open311Request,
  reportToOpen311,
} from "@/lib/open311/transform";
import { toOpen311Xml } from "@/lib/open311/xml";

/**
 * Public photo shown for a request filed through the Open311 API. A caller's
 * media_url is deliberately never stored (it is neither blur-verified nor
 * ours), so an externally filed report has no first-party image, the same
 * situation the camera pipeline handles with VIDEO_PLACEHOLDER_PUBLIC_PATH.
 */
const OPEN311_PLACEHOLDER_PUBLIC_PATH = "/open311-external-placeholder.svg";

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
 * Open311 GeoReport v2, list service requests.
 * Public endpoint. Supports filters: jurisdiction_id, service_code,
 * start_date, end_date, status (open|closed).
 *
 * Content negotiation: ?format=xml → XML, otherwise JSON.
 */

/** Safe columns for public GET, no reporter PII, no raw storage paths */
const PUBLIC_REPORT_SELECT =
  "id, city_id, location, photo_public_url, status, address, created_at, updated_at, classifications(category, severity, confidence, reasoning, is_emergency), cities!inner(id, name, open311_jurisdiction_id)";

/**
 * Same columns, but with classifications joined as INNER so a
 * `classifications.category` filter actually constrains the parent reports.
 * A plain (left) embed would filter only the embedded rows and still return
 * every report, breaking `?service_code=` (H-bug: service_code returned all
 * categories). Used only when service_code is present.
 */
const PUBLIC_REPORT_SELECT_INNER_CLASS = PUBLIC_REPORT_SELECT.replace(
  "classifications(",
  "classifications!inner(",
);

export async function GET(request: NextRequest) {
  try {
    // Rate limit: 60 requests/min per IP (generous for public spec clients)
    const rl = checkRateLimit(`open311_list:${clientIp(request)}`, {
      windowMs: 60_000,
      max: 60,
    });
    if (!rl.allowed) {
      return open311Error(429, "Rate limit exceeded", negotiateXml(request));
    }

    const params = request.nextUrl.searchParams;
    const jurisdictionId = params.get("jurisdiction_id");
    const serviceCode = params.get("service_code");
    const startDate = params.get("start_date");
    const endDate = params.get("end_date");
    const statusParam = params.get("status");
    const wantsXml = negotiateXml(request);

    // Reject unknown status values, silently ignoring them violates spec
    if (
      statusParam !== null &&
      statusParam !== "open" &&
      statusParam !== "closed"
    ) {
      return open311Error(400, "status must be 'open' or 'closed'", wantsXml);
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

    // Select only safe public columns, no description, no photo_raw_url, no
    // reporter PII. When service_code is set we must INNER-join classifications
    // so the category filter constrains the parent reports; a left embed would
    // filter only the embedded rows and still return every report.
    let query = db
      .from("reports")
      .select(
        serviceCode ? PUBLIC_REPORT_SELECT_INNER_CLASS : PUBLIC_REPORT_SELECT,
      );

    // Filter by jurisdiction if provided
    if (jurisdictionId) {
      query = query.eq("cities.open311_jurisdiction_id", jurisdictionId);
    }

    // Filter by service_code (= category on classifications). The inner join
    // selected above makes this exclude reports without a matching category.
    if (serviceCode) {
      query = query.eq("classifications.category", serviceCode);
    }

    // Filter by Open311 status, expand to internal status values
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

    // Exclude rejected (and merged) reports from the public feed, H13
    query = query.not("status", "in", '("rejected","merged")');

    query = query
      .order("created_at", { ascending: false })
      .range(rangeFrom, rangeTo);

    const { data, error } = await query;

    if (error) {
      logger.error("Database query failed", error);
      return open311Error(500, "Database query failed", wantsXml);
    }

    /** A PostgREST embed: array for to-many, bare object for to-one. */
    const EMBED = z
      .union([z.array(z.unknown()), z.record(z.string(), z.unknown())])
      .nullable();

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
        // Object OR array, PostgREST shapes an embed by cardinality, and a
        // migration adding a unique constraint flips it. Accepting only arrays
        // silently emptied this endpoint; see firstEmbed().
        classifications: EMBED,
        cities: EMBED,
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
        const classification = firstEmbed<Classification>(v.classifications);
        const city = firstEmbed<City>(v.cities);
        return city ? reportToOpen311(report, classification, city) : null;
      })
      // Type-guard filter so the result is Open311Request[], not
      // (Open311Request | null)[]. Boolean alone doesn't narrow out null.
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
    return open311Error(500, "Internal server error", negotiateXml(request));
  }
}

/**
 * POST /api/open311/v2/requests
 *
 * Open311 GeoReport v2. Create a new service request.
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
  const wantsXml = negotiateXml(request);

  try {
    // Rate limit early, before body parsing or the API-key check, so a leaked
    // key (or key-guessing) can't drive unbounded report inserts + Gemini spend.
    // 30 POSTs/min per IP is generous for a spec-conformant integration.
    const rl = checkRateLimit(`open311_post:${clientIp(request)}`, {
      windowMs: 60_000,
      max: 30,
    });
    if (!rl.allowed) {
      return open311Error(429, "Rate limit exceeded", wantsXml);
    }

    // Parse body (supports both JSON and form-encoded)
    let body: Record<string, string>;
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries()) as Record<string, string>;
    }

    // Validate API key. Per-partner keys (api_keys table, migration 028) are
    // looked up by SHA-256 hash and carry attribution + optional city scope;
    // the shared env-var key stays as a legacy fallback (constant-time compare,
    // H10). Either path must succeed.
    const apiKey = body.api_key ?? request.nextUrl.searchParams.get("api_key");
    if (!apiKey) {
      return open311Error(
        401,
        "API key is required and must be valid",
        wantsXml,
      );
    }
    const partner = await lookupApiKey(apiKey);
    const expectedKey = process.env.OPEN311_API_KEY;
    const legacyOk =
      !!expectedKey && !partner && safeCompare(apiKey, expectedKey);
    if (!partner && !legacyOk) {
      return open311Error(
        401,
        "API key is required and must be valid",
        wantsXml,
      );
    }
    // Per-partner keys must carry the open311:write scope to POST. The legacy
    // shared env key is unscoped and implicitly full-access. A read-only key
    // (e.g. scopes ['open311:read']) is rejected here with 403, not 401. The
    // key is valid, it just lacks the permission.
    if (partner && !partner.scopes.includes("open311:write")) {
      return open311Error(
        403,
        "API key lacks the open311:write scope required to submit requests",
        wantsXml,
      );
    }

    // Validate required fields
    const serviceCode = body.service_code;
    if (!serviceCode || !getService(serviceCode)) {
      return open311Error(
        400,
        `Invalid or missing service_code. Use GET /services for valid codes.`,
        wantsXml,
      );
    }

    const lat = parseFloat(body.lat);
    const lng = parseFloat(body.long);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return open311Error(
        400,
        "lat and long are required numeric fields",
        wantsXml,
      );
    }
    if (lat < -90 || lat > 90) {
      return open311Error(400, "lat must be between -90 and 90", wantsXml);
    }
    if (lng < -180 || lng > 180) {
      return open311Error(400, "long must be between -180 and 180", wantsXml);
    }

    const description = body.description ?? null;
    if (description && description.length > 2000) {
      return open311Error(
        400,
        "description must be 2000 characters or fewer",
        wantsXml,
      );
    }
    const addressString = body.address_string ?? null;
    if (addressString && addressString.length > 300) {
      return open311Error(
        400,
        "address_string must be 300 characters or fewer",
        wantsXml,
      );
    }

    const db = createServerClient();

    // Resolve city: a city-pinned partner key wins, then jurisdiction_id,
    // then the deterministic first active city.
    const jurisdictionId =
      body.jurisdiction_id ??
      request.nextUrl.searchParams.get("jurisdiction_id");

    let city: City;
    if (partner?.cityId) {
      const { data, error } = await db
        .from("cities")
        .select("*")
        .eq("id", partner.cityId)
        .single();
      if (error || !data) {
        return open311Error(500, "API key's city no longer exists", wantsXml);
      }
      city = data as City;
    } else if (jurisdictionId) {
      const { data, error } = await db
        .from("cities")
        .select("*")
        .eq("open311_jurisdiction_id", jurisdictionId)
        .eq("active", true)
        .single();

      if (error || !data) {
        return open311Error(400, "Unknown jurisdiction_id", wantsXml);
      }
      city = data as City;
    } else {
      // Deterministic "first active city": without an ORDER BY, Postgres can
      // return a different row across calls, so an Open311 POST with no
      // jurisdiction_id could land in different cities run-to-run. Order by
      // created_at (then id, to break ties) for a stable canonical city.
      const { data, error } = await db
        .from("cities")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(1)
        .single();

      if (error || !data) {
        return open311Error(500, "No active city configured", wantsXml);
      }
      city = data as City;
    }

    // Reporter attribution: the partner key's own user when present, else the
    // legacy shared system user.
    const reporterId = partner?.userId ?? process.env.OPEN311_SYSTEM_USER_ID;
    if (!reporterId) {
      return open311Error(
        500,
        "Server misconfigured: OPEN311_SYSTEM_USER_ID not set",
        wantsXml,
      );
    }

    // media_url is accepted (it is an optional GeoReport v2 POST field, and
    // rejecting it outright would break conformance) but it is deliberately
    // NOT stored.
    //
    // `photo_public_url` means "a first-party image that went through the
    // mandatory face/plate blur pipeline and lives in the photos-public
    // bucket". A caller-supplied URL satisfies neither half of that: we cannot
    // attest it is blurred, and we do not control it. Writing it through meant
    // any holder of an open311:write key could put an arbitrary remote image,
    // unblurred faces and plates, or a tracking pixel that deanonymises every
    // viewer of the public dashboard. Onto the city's public map, and have it
    // echoed back as media_url in every subsequent GET.
    //
    // Photos reach us through the blur pipeline or not at all.
    const mediaUrl = body.media_url ?? "";
    if (mediaUrl) {
      try {
        const parsed = new URL(mediaUrl);
        if (parsed.protocol !== "https:") {
          return open311Error(400, "media_url must use https://", wantsXml);
        }
      } catch {
        return open311Error(400, "media_url must be a valid URL", wantsXml);
      }
      logger.warn("open311 media_url ignored (not blur-verified)", {
        host: (() => {
          try {
            return new URL(mediaUrl).host;
          } catch {
            return "unparseable";
          }
        })(),
      });
    }

    // Insert the report
    const { data: report, error: insertError } = await db
      .from("reports")
      .insert({
        city_id: city.id,
        reporter_id: reporterId,
        location: `SRID=4326;POINT(${lng} ${lat})`,
        // Never mediaUrl. See the note above the media_url validation.
        //
        // reports.photo_public_url is NOT NULL, so writing null here made the
        // insert fail with 23502 and this endpoint answer 500 to EVERY POST.
        // Refusing to store a caller-supplied media_url was the right call; it
        // just left nothing to satisfy a required column, and no test posts a
        // service request, so the whole inbound half of Open311 was dead while
        // the suite stayed green.
        //
        // A placeholder is the honest value and matches what the camera
        // pipeline already does for reports with no first-party blurred photo
        // (VIDEO_PLACEHOLDER_PUBLIC_PATH). An externally filed request has no
        // such photo either, and the GET echoes this back as media_url, which
        // tells a consuming agency exactly what it is.
        photo_public_url: OPEN311_PLACEHOLDER_PUBLIC_PATH,
        photo_raw_url: null,
        status: "open" as const,
        address: addressString,
        description: description,
      })
      .select()
      .single();

    if (insertError || !report) {
      logger.error("Report insert failed", insertError);
      return open311Error(500, "Failed to create service request", wantsXml);
    }

    // Trigger AI classification async, fire-and-forget (H2). Call the pipeline
    // IN-PROCESS rather than HTTP self-calling /api/ai/classify: the old fetch
    // depended on NEXT_PUBLIC_SITE_URL and silently fell back to
    // http://localhost:3000, so in production (env unset) externally-submitted
    // Open311 reports were never classified. runClassifyPipeline is the same
    // function that route invokes, minus a network hop and its auth (we're
    // already past api_key validation here).
    after(() =>
      runClassifyPipeline(report.id).catch((err) => {
        logger.error("Classify trigger failed", err, { reportId: report.id });
      }),
    );

    // Return Open311 POST response, token = service_request_id for simplicity
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
    return open311Error(500, "Internal server error", wantsXml);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Constant-time string comparison. Prevents timing oracle on API key check. */
function safeCompare(a: string, b: string): boolean {
  // Hash both sides to fixed-length digests so an unequal-length guess takes the
  // same path as an equal-length one (no early-exit length oracle).
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}

function escXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Only safe public columns are fetched, no description, no photo_raw_url, no reporter_id
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
