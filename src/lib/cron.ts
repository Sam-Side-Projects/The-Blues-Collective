/**
 * Shared helpers for the scheduled data-sync jobs (Vercel Cron).
 *
 * IMPORTANT architecture rule for this project: normal page loads NEVER call
 * the football APIs. Only these cron route handlers do, on a schedule, and
 * they write the results into Supabase. Pages only ever read from our own DB.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Only allow a sync to run if the caller knows CRON_SECRET. Vercel Cron sends
 * it as `Authorization: Bearer <secret>`; we also accept `?key=<secret>` so the
 * owner can trigger a sync by hand from a browser if ever needed.
 */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret === "change_me_before_deploy") return false;

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const url = new URL(req.url);
  return url.searchParams.get("key") === secret;
}

/** Record an external API call so we can watch usage against free-tier limits. */
export async function logApiCall(
  admin: SupabaseClient,
  apiName: "football-data" | "api-football",
  endpoint: string,
  status: "ok" | "skipped" | "error",
  note?: string
): Promise<void> {
  try {
    await admin.from("api_call_log").insert({
      api_name: apiName,
      endpoint,
      status,
      note: note ?? null,
    });
  } catch {
    // Logging must never crash the sync itself.
  }
}
