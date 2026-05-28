// Verify upvote RLS + trigger with a REAL user JWT (same path the action uses).
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

const user = createClient(URL, ANON, { auth: { persistSession: false } });
const { data: auth, error: signErr } = await user.auth.signInWithPassword({
  email: "resident@civic-test.local",
  password: "CivicDemo123!",
});
if (signErr) { console.error("sign-in FAIL:", signErr.message); process.exit(1); }
console.log("signed in as", auth.user.email);

const svc = createClient(URL, SVC, { auth: { persistSession: false } });
const { data: report } = await svc
  .from("reports").select("id").eq("status", "open").limit(1).single();
const rid = report.id;
console.log("target report:", rid);

// insert upvote via the authed user (RLS-enforced)
const { error: insErr } = await user.from("report_upvotes").insert({ report_id: rid, user_id: auth.user.id });
console.log("insert upvote:", insErr ? "FAIL " + insErr.message : "OK");

let { data: r1 } = await svc.from("reports").select("upvote_count").eq("id", rid).single();
console.log("upvote_count after insert:", r1.upvote_count);

// duplicate insert should fail (PK) — one vote per user
const { error: dupErr } = await user.from("report_upvotes").insert({ report_id: rid, user_id: auth.user.id });
console.log("duplicate insert rejected:", dupErr ? "OK (" + dupErr.code + ")" : "FAIL (allowed)");

// delete upvote (toggle off)
const { error: delErr } = await user.from("report_upvotes").delete().eq("report_id", rid).eq("user_id", auth.user.id);
console.log("delete upvote:", delErr ? "FAIL " + delErr.message : "OK");

let { data: r2 } = await svc.from("reports").select("upvote_count").eq("id", rid).single();
console.log("upvote_count after delete:", r2.upvote_count);
