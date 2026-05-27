import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/client";
import { reportToOpen311 } from "@/lib/open311/transform";
import { toOpen311SingleXml, toErrorXml } from "@/lib/open311/xml";
import type { Report, Classification, City } from "@/lib/types";

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
    const { id } = await params;
    const db = createServerClient();

    const { data: row, error } = await db
      .from("reports")
      .select("*, classifications(*), cities!inner(*)")
      .eq("id", id)
      .single();

    if (error || !row) {
      return errorResponse(404, `Service request ${id} not found`, wantsXml);
    }

    const report = rowToReport(row);
    const classification: Classification | null =
      row.classifications?.[0] ?? row.classifications ?? null;
    const city: City = row.cities;

    const open311Request = reportToOpen311(report, classification, city);

    if (wantsXml) {
      return new NextResponse(toOpen311SingleXml(open311Request), {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    return NextResponse.json([open311Request]);
  } catch (err) {
    console.error("Open311 GET /requests/[id] error:", err);
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

/**
 * Extract the Report fields from a Supabase joined row.
 * Handles PostGIS geometry → {lat, lng} normalization.
 */
function rowToReport(row: any): Report {
  let location = row.location;
  if (typeof location === "object" && location?.coordinates) {
    location = { lng: location.coordinates[0], lat: location.coordinates[1] };
  } else if (typeof location === "string") {
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
