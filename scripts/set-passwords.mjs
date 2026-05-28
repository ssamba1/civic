// Sets a known password on the 3 seeded auth users so demo login is deterministic.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = process.env.DEMO_PASSWORD || "CivicDemo123!";
const supabase = createClient(url, key, { auth: { persistSession: false } });

const emails = [
  "resident@civic-test.local",
  "dispatcher@civic-test.local",
  "admin@civic-test.local",
];

const { data: list } = await supabase.auth.admin.listUsers();
for (const email of emails) {
  const u = list.users.find((x) => x.email === email);
  if (!u) {
    console.log(`MISSING ${email}`);
    continue;
  }
  const { error } = await supabase.auth.admin.updateUserById(u.id, { password: PASSWORD });
  console.log(`${error ? "FAIL" : "OK  "} ${email} (${u.id})`);
}
console.log(`password set to: ${PASSWORD}`);
