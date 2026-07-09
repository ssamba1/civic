import crypto from "node:crypto";
import { after, type NextRequest, NextResponse } from "next/server";
import { generateWorkOrder } from "@/lib/ai/work-order-rules";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import { publicToken } from "@/lib/public-report";
import type { Classification } from "@/lib/types";

/* ==================================================================
   SMS / MMS inbound intake (NEXT_100 #2).

   Twilio POSTs here when a resident texts the city number. This reaches the
   residents app-only tools exclude — feature-phone, senior, low-income.

   PRIVACY (hard rule): the client-side face/plate blur can't run on an inbound
   MMS (there is no client). So an attached photo is written to the RESTRICTED
   photos-raw bucket ONLY and NEVER to photos-public; the report is flagged
   needs_manual_review so a human verifies/blurs before anything is public. The
   public photo slot gets a neutral category placeholder, never the raw image.
   ================================================================== */

const logger = createLogger("[sms-inbound]");

const RAW_BUCKET = "photos-raw";
const PUBLIC_BUCKET = "photos-public";

// Fallback anchor when the texted address can't be geocoded (location is NOT
// NULL). Matches the app's demo default city; override per-deploy via env.
const FALLBACK_CENTER = {
  lat: Number(process.env.SMS_INTAKE_LAT ?? "19.0948"),
  lng: Number(process.env.SMS_INTAKE_LNG ?? "74.748"),
};

function fallbackClassification(reason: string): Classification {
  return {
    category: "other",
    subcategory: "sms-intake",
    severity: 3,
    hazard_radius_m: 0,
    visible_size_estimate: "unknown",
    is_emergency: false,
    confidence: 0,
    reasoning: reason,
    no_issue_detected: false,
    alternate_categories: [],
  };
}

// Twilio request-signature validation: base64 HMAC-SHA1 of (full URL + every
// POST param sorted by key, concatenated) keyed by the auth token.
function isValidTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
  authToken: string,
): boolean {
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  const expected = crypto
    .createHmac("sha1", authToken)
    .update(Buffer.from(data, "utf-8"))
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Forward-geocode free text → coords via Nominatim (same provider as the report
// reverse-geocoder). Best-effort; null on any miss.
async function geocode(
  query: string,
): Promise<{ lat: number; lng: number } | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`,
      {
        headers: {
          "User-Agent":
            "civic-app/1.0 (+https://civic-social-impact.vercel.app)",
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as { lat?: string; lon?: string }[];
    const hit = rows[0];
    const lat = Number(hit?.lat);
    const lng = Number(hit?.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

function twiml(message: string): NextResponse {
  const body = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`;
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = String(v);

  // Signature check. In production a missing token or bad signature is fatal
  // (anyone could POST fake reports). Dev without a token is allowed for local
  // testing.
  const signature = request.headers.get("x-twilio-signature") ?? "";
  const webhookUrl =
    (process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "") +
    "/api/sms/inbound";
  const verifyUrl = process.env.NEXT_PUBLIC_SITE_URL ? webhookUrl : request.url;
  if (authToken) {
    if (!isValidTwilioSignature(verifyUrl, params, signature, authToken)) {
      logger.warn("sms_bad_signature", { from: params.From });
      return new NextResponse("invalid signature", { status: 403 });
    }
  } else if (process.env.NODE_ENV === "production") {
    logger.error("sms_no_auth_token_prod", undefined, {});
    return new NextResponse("sms not configured", { status: 503 });
  }

  const from = params.From ?? "";
  const bodyText = (params.Body ?? "").trim();
  const numMedia = Number(params.NumMedia ?? "0");

  const service = createServerClient();

  // Resolve the intake city: configured slug, else the first active city.
  const citySlug = process.env.SMS_INTAKE_CITY_SLUG ?? "ahilyanagar";
  let cityId: string | null = null;
  const { data: bySlug } = await service
    .from("cities")
    .select("id")
    .eq("slug", citySlug)
    .maybeSingle<{ id: string }>();
  if (bySlug?.id) {
    cityId = bySlug.id;
  } else {
    const { data: anyCity } = await service
      .from("cities")
      .select("id")
      .eq("active", true)
      .limit(1)
      .maybeSingle<{ id: string }>();
    cityId = anyCity?.id ?? null;
  }
  if (!cityId) {
    logger.error("sms_no_city", undefined, {});
    return twiml("Sorry — reporting isn't available right now.");
  }

  const coord = (await geocode(bodyText)) ?? FALLBACK_CENTER;
  const reportId = crypto.randomUUID();

  // MMS photo → raw bucket ONLY (privacy). Never public. A miss is non-fatal:
  // the text report still stands.
  let rawUrl: string | null = null;
  if (numMedia > 0 && params.MediaUrl0 && authToken) {
    try {
      const mediaRes = await fetch(params.MediaUrl0, {
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${process.env.TWILIO_ACCOUNT_SID}:${authToken}`,
          ).toString("base64")}`,
        },
      });
      if (mediaRes.ok) {
        const bytes = Buffer.from(await mediaRes.arrayBuffer());
        const ct = params.MediaContentType0 ?? "image/jpeg";
        const ext = ct.includes("png") ? "png" : "jpg";
        const rawPath = `${cityId}/sms/${reportId}.${ext}`;
        const { error } = await service.storage
          .from(RAW_BUCKET)
          .upload(rawPath, bytes, { contentType: ct, upsert: false });
        if (!error) rawUrl = `${RAW_BUCKET}/${rawPath}`;
        else logger.warn("sms_media_upload_failed", { detail: error.message });
      }
    } catch (err) {
      logger.warn("sms_media_fetch_failed", {
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Neutral public placeholder — never the raw MMS. A staffer swaps in a
  // blurred image during manual review.
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const placeholder = `${base}/storage/v1/object/public/${PUBLIC_BUCKET}/seed/other.jpg`;

  const { error: reportErr } = await service.from("reports").insert({
    id: reportId,
    city_id: cityId,
    reporter_id: null,
    source: "resident",
    location: `SRID=4326;POINT(${coord.lng} ${coord.lat})`,
    photo_public_url: placeholder,
    photo_raw_url: rawUrl,
    address: bodyText || null,
    description: bodyText
      ? `SMS from ${from}: ${bodyText}`
      : `SMS from ${from}`,
    tags: ["sms-intake"],
    status: "open",
  });
  if (reportErr) {
    logger.error("sms_report_insert_failed", undefined, {
      detail: reportErr.message,
    });
    return twiml("Sorry — we couldn't file your report. Please try again.");
  }

  // Classification + work order, held for manual review (no auto-dispatch): the
  // raw photo hasn't been vetted and the category is unknown until a human looks.
  const classification = fallbackClassification(
    "Filed via SMS — pending manual review",
  );
  after(async () => {
    try {
      await service.from("classifications").insert({
        report_id: reportId,
        ...classification,
        model_version: "sms-intake",
        raw_response: {},
      });
      const wo = generateWorkOrder(classification, { recurrenceCount: 0 });
      await service.from("work_orders").insert({
        report_id: reportId,
        department: wo.department,
        crew_type: wo.crew_type,
        priority_score: wo.priority_score,
        est_minutes: wo.est_minutes,
        materials: wo.materials,
        est_cost: wo.est_cost,
        wo_source: "rules",
        needs_manual_review: true,
      });
    } catch (err) {
      logger.error("sms_classify_wo_failed", err, { reportId });
    }
  });

  // Reply with the account-less status link so the texter can follow along.
  const siteBase = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const link = siteBase
    ? ` Track it: ${siteBase}/r/${publicToken(reportId)}`
    : "";
  return twiml(
    `Thanks — your report was filed and a crew will review it.${link}`,
  );
}
