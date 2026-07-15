// Usage: node scripts/make-admin.mjs your@email.com
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const email = process.argv[2];
if (!email) {
  console.log("Please pass an email, e.g.: node scripts/make-admin.mjs you@email.com");
  process.exit(1);
}

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) =>
  env.split("\n").find((l) => l.startsWith(k + "="))?.slice(k.length + 1).trim();

const supabase = createClient(
  get("NEXT_PUBLIC_SUPABASE_URL"),
  get("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } }
);

const { data: list } = await supabase.auth.admin.listUsers();
const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (!user) {
  console.log(`No account found for ${email}. Sign up first, then re-run this.`);
  process.exit(1);
}

const { error } = await supabase
  .from("profiles")
  .update({ is_admin: true })
  .eq("id", user.id);

if (error) console.log("Error:", error.message);
else console.log(`✅ ${email} is now an admin.`);
