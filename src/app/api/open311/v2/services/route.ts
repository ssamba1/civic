import { type NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "@/lib/ai/rate-limit";
import { open311Error, wantsXml } from "@/lib/open311/http";
import { getAllServices } from "@/lib/open311/services";
import { toServicesXml } from "@/lib/open311/xml";

/**
 * GET /api/open311/v2/services
 *
 * Open311 GeoReport v2, list all available service types.
 * Public endpoint, no auth required.
 *
 * Content negotiation: ?format=xml or Accept: text/xml → XML, otherwise JSON.
 * Note: canonical Open311 URL is /services.json. This route handles the
 * equivalent via query-param format selection. A Next.js middleware rewrite
 * can map /services.json → /services?format=json if needed.
 */
export async function GET(request: NextRequest) {
  const xml = wantsXml(request);
  try {
    const rl = checkRateLimit(`open311_services:${clientIp(request)}`, {
      windowMs: 60_000,
      max: 120,
    });
    if (!rl.allowed) return open311Error(429, "Rate limit exceeded", xml);

    const services = getAllServices();

    if (xml) {
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
    return open311Error(500, "Internal server error", xml);
  }
}
