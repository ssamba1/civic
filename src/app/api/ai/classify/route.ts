import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/client";
import { classifyPhoto } from "@/lib/ai/gemini";
import { generateWorkOrder } from "@/lib/ai/work-order-rules";
import type { Report } from "@/lib/types";

const PUBLIC_BUCKET = "photos-public";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const reportId = body?.report_id;
    if (typeof reportId !== "string" || !reportId) {
      return NextResponse.json(
        { error: "report_id is required" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // ── Fetch report ────────────────────────────────────
    const { data: report, error: reportErr } = await supabase
      .from("reports")
      .select("*")
      .eq("id", reportId)
      .single<Report>();

    if (reportErr || !report) {
      return NextResponse.json(
        { error: `Report not found: ${reportErr?.message ?? "no rows"}` },
        { status: 404 }
      );
    }

    // ── Download photo from public bucket ───────────────
    // Use the blurred public photo for AI classification (privacy-safe).
    // Storage path follows {cityId}/{reportId}.webp convention.
    const storagePath = `${report.city_id}/${report.id}.webp`;
    const { data: photoBlob, error: downloadErr } = await supabase.storage
      .from(PUBLIC_BUCKET)
      .download(storagePath);

    if (downloadErr || !photoBlob) {
      return NextResponse.json(
        {
          error: `Photo download failed: ${downloadErr?.message ?? "empty blob"}`,
        },
        { status: 500 }
      );
    }

    const arrayBuffer = await photoBlob.arrayBuffer();
    const imageBase64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = "image/webp";

    // ── Classify with Gemini ────────────────────────────
    const classificationResult = await classifyPhoto(imageBase64, mimeType);
    if (!classificationResult.ok) {
      return NextResponse.json(
        { error: classificationResult.error },
        { status: 502 }
      );
    }
    const classification = classificationResult.data;

    // ── Emergency early return ──────────────────────────
    if (classification.is_emergency) {
      // Insert classification immediately so it's persisted even before
      // work order generation — responders need the data fast.
      await supabase.from("classifications").insert({
        report_id: reportId,
        ...classification,
      });

      await supabase
        .from("reports")
        .update({ status: "dispatched" })
        .eq("id", reportId);

      return NextResponse.json(
        {
          emergency: true,
          classification,
          work_order: null,
        },
        { status: 200 }
      );
    }

    // ── Generate work order ─────────────────────────────
    // Default context — in production these would come from GIS data and
    // historical report counts for this location.
    const workOrder = generateWorkOrder(classification, {
      isSchoolZone: false,
      footTrafficWeight: 1,
      recurrenceCount: 0,
    });

    // ── Persist classification + work order ─────────────
    const { error: classInsertErr } = await supabase
      .from("classifications")
      .insert({
        report_id: reportId,
        ...classification,
      });

    if (classInsertErr) {
      return NextResponse.json(
        { error: `Classification insert failed: ${classInsertErr.message}` },
        { status: 500 }
      );
    }

    const { data: insertedWorkOrder, error: woInsertErr } = await supabase
      .from("work_orders")
      .insert({
        report_id: reportId,
        department: workOrder.department,
        crew_type: workOrder.crew_type,
        priority_score: workOrder.priority_score,
        est_minutes: workOrder.est_minutes,
        materials: workOrder.materials,
      })
      .select()
      .single();

    if (woInsertErr) {
      return NextResponse.json(
        { error: `Work order insert failed: ${woInsertErr.message}` },
        { status: 500 }
      );
    }

    // ── Update report status ────────────────────────────
    await supabase
      .from("reports")
      .update({ status: "dispatched" })
      .eq("id", reportId);

    return NextResponse.json({
      emergency: false,
      classification,
      work_order: insertedWorkOrder,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Unexpected error: ${message}` },
      { status: 500 }
    );
  }
}
