import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) =>
  env.split("\n").find((l) => l.startsWith(k + "="))?.slice(k.length + 1).trim();

const supabase = createClient(
  get("NEXT_PUBLIC_SUPABASE_URL"),
  get("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } }
);

const BUCKET = "post-images";

const { data: existing } = await supabase.storage.getBucket(BUCKET);
if (existing) {
  console.log(`Bucket "${BUCKET}" already exists — nothing to do.`);
} else {
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true, // images are readable by anyone via URL
    fileSizeLimit: 2 * 1024 * 1024, // 2 MB cap
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  });
  if (error) {
    console.log("ERROR creating bucket:", error.message);
    process.exit(1);
  }
  console.log(`Created public bucket "${BUCKET}" (2MB cap, images only).`);
}
