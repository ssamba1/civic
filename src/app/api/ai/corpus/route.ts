/**
 * GET /api/ai/corpus
 *
 * Admin-gated endpoint that builds and returns the classification fine-tune
 * corpus as a downloadable JSONL file. Each line is one JSON training example.
 *
 * Auth guard: mirrors the pattern in /api/admin/surge and /api/admin/sla-escalate.
 * Requires a session with role in [staff_dispatcher, staff_supervisor, admin].
 * DEV_AUTH_BYPASS=1 skips auth in development.
 *
 * Does NOT auto-fine-tune. Just produces the corpus for offline review/upload.
 */
import { NextResponse } from "next/server";
import {
  buildCorpus,
  corpusStats,
  dedupeCorpus,
} from "@/lib/ai/feedback-corpus";
import { checkRateLimit, clientIp } from "@/lib/ai/rate-limit";
import { listFeedbackForCorpus } from "@/lib/db/classification-feedback";
import { createSSRClient, getAuthUser } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";

const logger = createLogger("[corpus-api]");

const STAFF_ROLES = ["staff_dispatcher", "staff_supervisor", "admin"];

async function authorize(request: Request): Promise<NextResponse | null> {
  // Rate-limit corpus downloads (large payload, expensive query).
  const rl = checkRateLimit(`corpus:${clientIp(request)}`, {
    windowMs: 60_000,
    max: 10,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // Dev bypass. Matches pattern in surge/sla-escalate routes.
  const devBypass =
    process.env.NODE_ENV === "development" &&
    process.env.DEV_AUTH_BYPASS === "1";
  if (devBypass) return null;

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ssr = await createSSRClient();
  const { data: profile } = await ssr
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !STAFF_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const authError = await authorize(request);
    if (authError) return authError;

    // Fetch rows, build corpus, dedupe.
    const rows = await listFeedbackForCorpus();
    const raw = buildCorpus(rows);
    const examples = dedupeCorpus(raw);
    const stats = corpusStats(examples);

    logger.info("corpus_built", {
      totalRows: rows.length,
      examples: examples.length,
      stats,
    });

    // Serialize as JSONL (one JSON object per line).
    const jsonl = examples.map((ex) => JSON.stringify(ex)).join("\n");

    // Return as downloadable JSONL with stats in headers.
    return new NextResponse(jsonl, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson",
        "Content-Disposition": `attachment; filename="classification-corpus-${new Date().toISOString().slice(0, 10)}.jsonl"`,
        "X-Corpus-Examples": String(stats.total),
        "X-Corpus-Categories": String(stats.uniqueCategories),
      },
    });
  } catch (err) {
    logger.error("Unhandled error in corpus route", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
