import { createClient } from "@supabase/supabase-js";

/**
 * Cookie-free Supabase client for public, read-only rendering.
 *
 * This lives in its own file on purpose: `supabase/server.ts` imports
 * `next/headers`, which isn't available when social preview images are
 * generated (they run in a separate worker outside the normal request), so
 * importing that module there crashes the image.
 *
 * Uses the public anon key, so row-level security still applies — it can only
 * read what any logged-out visitor could read.
 */
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}
