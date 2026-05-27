import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/db/ssr-client";
import { runClassifyPipeline } from "@/lib/ai/classify-pipeline";

export async function POST(request: Request) {
  try {
    // Auth check: accept either a valid user session OR an internal secret header.
    // The internal secret allows server actions and background jobs to call this
    // without forwarding browser cookies.
    const user = await getAuthUser();
    if (!user) {
      const internalKey = (request as Request & { headers: Headers }).headers.get("x-internal-key");
      const expectedKey = process.env.INTERNAL_CLASSIFY_SECRET;
      const isInternal =
        expectedKey &&
        internalKey &&
        internalKey.length === expectedKey.length &&
        timingSafeEqual(Buffer.from(internalKey), Buffer.from(expectedKey));

      if (!isInternal) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await request.json();
    const reportId = body?.report_id;
    if (typeof reportId !== "string" || !reportId) {
      return NextResponse.json({ error: "report_id is required" }, { status: 400 });
    }

    const result = await runClassifyPipeline(reportId);

    if (!result.ok) {
      const status = result.error.startsWith("Report not found") ? 404 : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result.data, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Unexpected error: ${message}` }, { status: 500 });
  }
}
