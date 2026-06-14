import { type NextRequest, NextResponse } from "next/server";
import { getAllServices } from "@/lib/open311/services";
import { toErrorXml, toServicesXml } from "@/lib/open311/xml";

/**
 * GET /api/open311/v2/services
 *
 * Open311 GeoReport v2 — list all available service types.
 * Public endpoint, no auth required.
 *
 * Content negotiation: ?format=xml or Accept: text/xml → XML, otherwise JSON.
 * Note: canonical Open311 URL is /services.json — this route handles the
 * equivalent via query-param format selection. A Next.js middleware rewrite
 * can map /services.json → /services?format=json if needed.
 */
export async function GET(request: NextRequest) {
  try {
    const services = getAllServices();
    const wantsXml = requestWantsXml(request);

    if (wantsXml) {
      return new NextResponse(toServicesXml(services), {
        status: 200,
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    return NextResponse.json(services, {
      status: 200,
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return errorResponse(
      500,
      "Internal server error",
      requestWantsXml(request),
    );
  }
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
