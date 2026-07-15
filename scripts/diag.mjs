import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// Load env from .env.local
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) =>
  env.split("\n").find((l) => l.startsWith(k + "="))?.slice(k.length + 1).trim();

const supabase = createClient(
  get("NEXT_PUBLIC_SUPABASE_URL"),
  get("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } }
);

const { data: users, error: uErr } = await supabase.auth.admin.listUsers();
if (uErr) {
  console.log("AUTH LIST ERROR:", uErr.message);
} else {
  console.log("=== auth.users ===");
  for (const u of users.users) {
    console.log(
      `- ${u.email} | confirmed: ${!!u.email_confirmed_at} | username_meta: ${u.user_metadata?.username ?? "(none)"} | id: ${u.id.slice(0, 8)}`
    );
  }
}

const { data: profiles, error: pErr } = await supabase
  .from("profiles")
  .select("id, username, is_admin");
console.log("\n=== profiles ===");
if (pErr) console.log("PROFILES ERROR:", pErr.message);
else for (const p of profiles) console.log(`- @${p.username} | admin: ${p.is_admin} | id: ${p.id.slice(0, 8)}`);
