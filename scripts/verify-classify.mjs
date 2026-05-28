// Headless e2e of the AI pipeline: create report → upload raw jpg →
// POST /api/ai/classify → read back classification+work_order → cleanup.
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// 1x1 JPEG (valid) — proves the pipeline runs end-to-end.
const JPG_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==";

const { data: city } = await supabase.from("cities").select("id").eq("slug", "cumming").single();
const { data: resident } = await supabase.from("users").select("id").eq("role", "resident").limit(1).single();
const reportId = crypto.randomUUID();

const { error: insErr } = await supabase.from("reports").insert({
  id: reportId,
  city_id: city.id,
  reporter_id: resident.id,
  location: "SRID=4326;POINT(-84.14 34.21)",
  photo_public_url: "test://verify",
  status: "open",
});
if (insErr) { console.error("insert report FAIL:", insErr.message); process.exit(1); }

const path = `${city.id}/${reportId}.jpg`;
const { error: upErr } = await supabase.storage
  .from("photos-raw")
  .upload(path, Buffer.from(JPG_B64, "base64"), { contentType: "image/jpeg", upsert: true });
if (upErr) { console.error("upload raw FAIL:", upErr.message); }

const res = await fetch("http://localhost:3000/api/ai/classify", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-internal-key": process.env.INTERNAL_CLASSIFY_SECRET },
  body: JSON.stringify({ report_id: reportId }),
});
console.log("classify HTTP", res.status);
console.log(await res.text());

const { data: cl } = await supabase
  .from("classifications")
  .select("category,confidence,model_version,is_emergency")
  .eq("report_id", reportId)
  .maybeSingle();
console.log("classification row:", cl);

const { data: wo } = await supabase
  .from("work_orders")
  .select("department,est_minutes,priority_score")
  .eq("report_id", reportId)
  .maybeSingle();
console.log("work_order row:", wo);

await supabase.from("reports").delete().eq("id", reportId);
await supabase.storage.from("photos-raw").remove([path]);
console.log("cleaned up test report", reportId);
