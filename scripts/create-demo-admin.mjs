// One-shot: create (or repair) a demo admin account for the live demo.
// DEMO ONLY. Do not run against production. Creates a known-credential admin.
//
//   node scripts/create-demo-admin.mjs
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// --- demo credentials (mirrored in login-form.tsx dev prefill) ---
const EMAIL = "admin@civicdemo.com";
const PASSWORD = "civic-admin-2026";
const DISPLAY_NAME = "Demo Admin";
const CITY_SLUG = "cumming";

// --- load .env.local (simple parse; values may contain '=') ---
const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 1. find Cumming city_id (users.city_id is NOT NULL)
const { data: city, error: cityErr } = await admin
  .from("cities")
  .select("id")
  .eq("slug", CITY_SLUG)
  .single();
if (cityErr || !city) {
  console.error(`Could not find city slug='${CITY_SLUG}':`, cityErr?.message);
  process.exit(1);
}

// 2. create the auth user (or find existing), with admin role in app_metadata
let userId;
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
  app_metadata: { role: "admin" },
  user_metadata: { display_name: DISPLAY_NAME },
});

if (createErr) {
  if (/already|registered|exists/i.test(createErr.message)) {
    // already there. Look it up and reset password + metadata
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = list?.users?.find((u) => u.email === EMAIL);
    if (!existing) {
      console.error("User exists but could not be located via listUsers.");
      process.exit(1);
    }
    userId = existing.id;
    await admin.auth.admin.updateUserById(userId, {
      password: PASSWORD,
      email_confirm: true,
      app_metadata: { role: "admin" },
      user_metadata: { display_name: DISPLAY_NAME },
    });
    console.log("Existing auth user repaired:", userId);
  } else {
    console.error("createUser failed:", createErr.message);
    process.exit(1);
  }
} else {
  userId = created.user.id;
  console.log("Auth user created:", userId);
}

// 3. upsert the public.users row with role=admin (service role bypasses RLS)
const { error: upsertErr } = await admin.from("users").upsert(
  {
    id: userId,
    city_id: city.id,
    role: "admin",
    email: EMAIL,
    display_name: DISPLAY_NAME,
  },
  { onConflict: "id" }
);
if (upsertErr) {
  console.error("users upsert failed:", upsertErr.message);
  process.exit(1);
}

console.log("\n✅ Demo admin ready");
console.log("   email:   ", EMAIL);
console.log("   password:", PASSWORD);
console.log("   role:     admin  (city:", CITY_SLUG + ")");
