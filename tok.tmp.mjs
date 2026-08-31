import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/)
  .filter(l=>l&&!l.trimStart().startsWith("#")&&l.includes("="))
  .map(l=>[l.slice(0,l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim()]));
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const { data: city } = await db.from("cities").select("id").eq("slug","cumming").single();
const { data, error } = await db.from("reports").select("id, public_token, status")
  .eq("city_id", city.id).not("public_token","is",null).limit(3);
if (error) { console.log("ERR", error.message); }
console.log("rows with a public_token:", data?.length ?? 0);
(data??[]).forEach(r=>console.log(`  ${r.public_token}  status=${r.status}`));
const { count } = await db.from("reports").select("*",{count:"exact",head:true}).eq("city_id", city.id).is("public_token", null);
console.log("cumming reports with NULL public_token:", count);
