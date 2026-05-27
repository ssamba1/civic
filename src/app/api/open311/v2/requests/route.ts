import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/client";
import { reportToOpen311, expandStatus } from "@/lib/open311/transform";
import { toOpen311Xml, toErrorXml } from "@/lib/open311/xml";
import { getService } from "@/lib/open311/services";
import type { Report, Classification, City, ReportCategory } from "@/lib/types";

/**
 * GET /api/open311/v2/requests
 *
 * Open311 GeoReport v2 — list service requests.
 * Public endpoint. Supports filters: jurisdiction_id, service_code,
 * start_date, end_date, status (open|closed).
 *
 * Content negotiation: ?format=xml → XML, otherwise JSON.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const jurisdictionId = params.get("jurisdiction_id");
    const serviceCode = params.get("service_code");
    const startDate = params.get("start_date");
    const endDate = params.get("end_date");
    const status = params.get("status") as "open" | "closed" | null;
    const wantsXml = requestWantsXml(request);

    const db = createServerClient();

    // Build the reports query with LEFT JOIN on classifications
    let query = db
      .from("reports")
      .select("*, classifications(*), cities!inner(*)");

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

    // Limit to 200 results (Open311 convention for pagination default)
    query = query.order("created_at", { ascending: false }).limit(200);

    const { data, error } = await query;

    if (error) {
      console.error("Open311 requests query error:", error);
      return errorResponse(500, "Database query failed", wantsXml);
    }

    // Transform rows to Open311 format
    const open311Requests = (data ?? []).map((row: any) => {
      const report = rowToReport(row);
      const classification: Classification | null =
        row.classifications?.[0] ?? row.classifications ?? null;
      const city: City = row.cities;
      return reportToOpen311(report, classification, city);
    });

    if (wantsXml) {
      return new NextResponse(toOpen311Xml(open311Requests), {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    return NextResponse.json(open311Requests);
  } catch (err) {
    console.error("Open311 GET /requests error:", err);
    return errorResponse(500, "Internal server error", requestWantsXml(request));
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

    // Validate API key
    const apiKey =
      body.api_key ?? request.nextUrl.searchParams.get("api_key");
    const expectedKey = process.env.OPEN311_API_KEY;
    if (!expectedKey || apiKey !== expectedKey) {
      return errorResponse(401, "API key is required and must be valid", wantsXml);
    }

    // Validate required fields
    const serviceCode = body.service_code;
    if (!serviceCode || !getService(serviceCode)) {
      return errorResponse(
        400,
        `Invalid or missing service_code. Use GET /services for valid codes.`,
        wantsXml
      );
    }

    const lat = parseFloat(body.lat);
    const lng = parseFloat(body.long);
    if (isNaN(lat) || isNaN(lng)) {
      return errorResponse(400, "lat and long are required numeric fields", wantsXml);
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
        wantsXml
      );
    }

    // Insert the report
    const { data: report, error: insertError } = await db
      .from("reports")
      .insert({
        city_id: city.id,
        reporter_id: reporterId,
        location: `POINT(${lng} ${lat})`,
        photo_public_url: body.media_url ?? "",
        photo_raw_url: null,
        status: "open" as const,
        address: body.address_string ?? null,
        description: body.description ?? null,
      })
      .select()
      .single();

    if (insertError || !report) {
      console.error("Open311 POST insert error:", insertError);
      return errorResponse(500, "Failed to create service request", wantsXml);
    }

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
    console.error("Open311 POST /requests error:", err);
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

function escXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Extract the Report fields from a Supabase joined row.
 * The DB stores location as PostGIS geometry; we normalize to {lat, lng}.
 */
function rowToReport(row: any): Report {
  // Handle PostGIS point → {lat, lng}. Supabase may return as
  // { type: "Point", coordinates: [lng, lat] } or as raw columns.
  let location = row.location;
  if (typeof location === "object" && location?.coordinates) {
    location = { lng: location.coordinates[0], lat: location.coordinates[1] };
  } else if (typeof location === "string") {
    // POINT(lng lat)
    const match = location.match(/POINT\(([^ ]+) ([^ ]+)\)/);
    if (match) {
      location = { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
    }
  }

  return {
    id: row.id,
    city_id: row.city_id,
    reporter_id: row.reporter_id,
    location,
    photo_public_url: row.photo_public_url,
    photo_raw_url: row.photo_raw_url,
    status: row.status,
    address: row.address,
    description: row.description,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
