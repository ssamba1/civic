import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runClassifyPipeline } from "@/lib/ai/classify-pipeline";
import { checkRateLimit, clientIp } from "@/lib/ai/rate-limit";
import { createLogger } from "@/lib/logger";
import { createSSRClient, getAuthUser } from "@/lib/db/ssr-client";

const logger = createLogger("[classify-api]");

export async function POST(request: Request) {
  try {
    // Auth check: accept either a valid user session OR an internal secret header.
    // The internal secret allows server actions and background jobs to call this
    // without forwarding browser cookies.
    const internalKey = (request as Request & { headers: Headers }).headers.get(
      "x-internal-key",
    );
    const expectedKey = process.env.INTERNAL_CLASSIFY_SECRET;
    const isInternal = Boolean(
      expectedKey &&
        internalKey &&
        Buffer.byteLength(internalKey) === Buffer.byteLength(expectedKey) &&
        timingSafeEqual(Buffer.from(internalKey), Buffer.from(expectedKey)),
    );

    // Rate limit non-internal callers (browser users, anonymous). The internal
    // x-internal-key path (server actions + Open311) is exempt.
    if (!isInternal) {
      const rl = checkRateLimit("classify:" + clientIp(request));
      if (!rl.allowed) {
        return NextResponse.json(
          { error: "Rate limited" },
          {
            status: 429,
            headers: {
              "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
            },
          },
        );
      }
    }

    const user = await getAuthUser();
    if (!user && !isInternal) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const reportId = body?.report_id;
    if (typeof reportId !== "string" || !reportId) {
      return NextResponse.json(
        { error: "report_id is required" },
        { status: 400 },
      );
    }

    // Object-level authorization. The pipeline runs under the service-role
    // client (RLS-bypassing), so an authenticated caller must NOT be allowed to
    // re-classify an arbitrary report. Gate the non-internal path with an
    // RLS-scoped read via the cookie-aware SSR client: reports_select_own
    // (reporter_id = auth.uid()) and reports_select_staff (is_staff + city)
    // return a row only when the caller actually owns or staffs the report.
    // No row -> not authorized -> 404 (don't disclose existence). The internal
    // x-internal-key path (server actions, Open311) stays exempt.
    if (!isInternal) {
      const ssr = await createSSRClient();
      const { data: ownedReport, error: ownErr } = await ssr
        .from("reports")
        .select("id")
        .eq("id", reportId)
        .maybeSingle();
      if (ownErr || !ownedReport) {
        return NextResponse.json(
          { error: "Report not found" },
          { status: 404 },
        );
      }
    }

    const result = await runClassifyPipeline(reportId);

    if (!result.ok) {
      const status = result.error.startsWith("Report not found") ? 404 : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result.data, { status: 200 });
  } catch (err) {
    logger.error("Unhandled error", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}
