import { type NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "@/lib/ai/rate-limit";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import { toErrorXml } from "@/lib/open311/xml";

const logger = createLogger("[open311-token]");

// The POST /requests handler returns `token: report.id`, so a token IS a report
// UUID. Validate the shape before touching the DB.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/open311/v2/tokens/[token]
 *
 * Open311 GeoReport v2 token→service_request_id lookup. A client that POSTed a
 * request and got back a temporary `token` resolves it here once the request is
 * persisted. Public endpoint (mirrors the other GET routes). Returns the
 * canonical `service_request_id` for a known token, 404 otherwise.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const wantsXml = requestWantsXml(request);
  try {
    const rl = checkRateLimit(`open311_token:${clientIp(request)}`, {
      windowMs: 60_000,
      max: 60,
    });
    if (!rl.allowed) return errorResponse(429, "Rate limit exceeded", wantsXml);

    const { token } = await params;
    if (!UUID_RE.test(token)) {
      return errorResponse(404, "Token not found", wantsXml);
    }

    const db = createServerClient();
    // Confirm the token maps to a real report before echoing it back as the id.
    const { data, error } = await db
      .from("reports")
      .select("id")
      .eq("id", token)
      .maybeSingle<{ id: string }>();

    if (error || !data) {
      return errorResponse(404, "Token not found", wantsXml);
    }

    const payload = { service_request_id: data.id, token };
    if (wantsXml) {
      return new NextResponse(
        [
          '<?xml version="1.0" encoding="utf-8"?>',
          "<service_requests>",
          "  <request>",
          `    <service_request_id>${data.id}</service_request_id>`,
          `    <token>${token}</token>`,
          "  </request>",
          "</service_requests>",
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } },
      );
    }
    return NextResponse.json([payload]);
  } catch (err) {
    logger.error("GET /tokens/[token] unhandled error", err);
    return errorResponse(500, "Internal server error", wantsXml);
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
