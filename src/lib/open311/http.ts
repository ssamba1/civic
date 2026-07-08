import { type NextRequest, NextResponse } from "next/server";
import { toErrorXml } from "@/lib/open311/xml";

/**
 * Content negotiation for the Open311 GeoReport v2 routes: ?format=xml|json
 * wins, else the Accept header. Extracted from the five v2 route handlers that
 * each had an identical copy.
 */
export function wantsXml(request: NextRequest): boolean {
  const format = request.nextUrl.searchParams.get("format");
  if (format === "xml") return true;
  if (format === "json") return false;
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/xml") || accept.includes("application/xml");
}

/**
 * Open311 error response in the negotiated format — XML <errors> or the JSON
 * `[{ code, description }]` array shape the spec's clients expect.
 */
export function open311Error(
  code: number,
  description: string,
  xml: boolean,
): NextResponse {
  if (xml) {
    return new NextResponse(toErrorXml(code, description), {
      status: code,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  }
  return NextResponse.json([{ code, description }], { status: code });
}
