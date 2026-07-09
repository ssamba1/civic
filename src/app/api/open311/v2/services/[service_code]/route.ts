import { type NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "@/lib/ai/rate-limit";
import { open311Error, wantsXml } from "@/lib/open311/http";
import { getService } from "@/lib/open311/services";

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
  const xml = wantsXml(request);
  const rl = checkRateLimit(`open311_service_def:${clientIp(request)}`, {
    windowMs: 60_000,
    max: 120,
  });
  if (!rl.allowed) return open311Error(429, "Rate limit exceeded", xml);

  const { service_code } = await params;
  const service = getService(service_code);

  if (!service) {
    return open311Error(404, "service_code not found", xml);
  }

  // GeoReport v2 service_definition: the service metadata + its attribute list
  // (empty here — no dynamic questionnaire in v1).
  const definition = { service_code: service.service_code, attributes: [] };

  if (xml) {
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
