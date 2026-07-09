import { type NextRequest, NextResponse } from "next/server";
import { getService } from "@/lib/open311/services";
import { toErrorXml } from "@/lib/open311/xml";

/**
 * GET /api/open311/v2/services/[service_code]
 *
 * Open311 GeoReport v2 service definition for one service. All Civic services
 * declare metadata:false (no dynamic attribute forms), so the definition is the
 * static service entry plus an empty `attributes` array — the shape a spec
 * consumer expects when it follows a service_code. Public, no auth.
 *
 * Content negotiation: ?format=xml or Accept: text/xml → XML, else JSON.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ service_code: string }> },
) {
  const wantsXml = requestWantsXml(request);
  const { service_code } = await params;
  const service = getService(service_code);

  if (!service) {
    return errorResponse(404, "service_code not found", wantsXml);
  }

  // GeoReport v2 service_definition: the service metadata + its attribute list
  // (empty here — no dynamic questionnaire in v1).
  const definition = { service_code: service.service_code, attributes: [] };

  if (wantsXml) {
    return new NextResponse(
      [
        '<?xml version="1.0" encoding="utf-8"?>',
        "<service_definition>",
        `  <service_code>${service.service_code}</service_code>`,
        "  <attributes></attributes>",
        "</service_definition>",
      ].join("\n"),
      {
        status: 200,
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      },
    );
  }

  return NextResponse.json(definition, {
    status: 200,
    headers: { "Cache-Control": "public, max-age=3600" },
  });
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
