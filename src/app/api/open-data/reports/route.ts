import { NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "@/lib/ai/rate-limit";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";

/* ==================================================================
   Open-data export (NEXT_100 #50).

   A public, anonymized, NYC-311-style dataset, aggregate report counts by
   category, status, and month for a city. Builds civic goodwill + research
   cred and gives journalists/academics a citable feed. Strictly aggregate:
   no reporter, no coordinates, no free text, nothing that identifies anyone.
   ================================================================== */

const logger = createLogger("[open-data]");

export const dynamic = "force-dynamic";

interface ClassRel {
  category: string | null;
}
interface Row {
  status: string | null;
  created_at: string | null;
  classifications: ClassRel | ClassRel[] | null;
}

function inc(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

export async function GET(request: Request) {
  const rl = checkRateLimit(`open_data:${clientIp(request)}`, {
    windowMs: 60_000,
    max: 30,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const sp = new URL(request.url).searchParams;
  const slug = sp.get("city")?.trim();
  const format = sp.get("format") === "csv" ? "csv" : "json";
  if (!slug) {
    return NextResponse.json(
      { error: "city query param required" },
      { status: 400 },
    );
  }

  const db = createServerClient();
  const { data: city } = await db
    .from("cities")
    .select("id, name, state")
    .eq("slug", slug)
    .maybeSingle<{ id: string; name: string; state: string }>();
  if (!city) {
    return NextResponse.json({ error: "unknown city" }, { status: 404 });
  }

  const { data, error } = await db
    .from("reports")
    .select("status, created_at, classifications(category)")
    .eq("city_id", city.id)
    .limit(50_000);
  if (error) {
    logger.error("open_data_query_failed", undefined, {
      detail: error.message,
    });
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const byCategory: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  for (const r of (data ?? []) as Row[]) {
    const cl = Array.isArray(r.classifications)
      ? r.classifications[0]
      : r.classifications;
    inc(byCategory, cl?.category ?? "unclassified");
    inc(byStatus, r.status ?? "unknown");
    if (r.created_at) inc(byMonth, r.created_at.slice(0, 7)); // YYYY-MM
  }

  // Self-serve CSV (#82): same aggregate data, spreadsheet-ready. One row per
  // (dimension, key, count) so it opens cleanly in Excel/Sheets.
  if (format === "csv") {
    const lines = ["dimension,key,count"];
    const push = (dim: string, m: Record<string, number>) => {
      for (const [k, v] of Object.entries(m)) lines.push(`${dim},${k},${v}`);
    };
    push("category", byCategory);
    push("status", byStatus);
    push("month", byMonth);
    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}-open-data.csv"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  return NextResponse.json(
    {
      city: { slug, name: city.name, state: city.state },
      total: (data ?? []).length,
      byCategory,
      byStatus,
      byMonth,
      license: "CC-BY-4.0",
      note: "Aggregate counts only, no personal data.",
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
