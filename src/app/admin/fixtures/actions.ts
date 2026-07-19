"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string };

/** Confirm the caller is a logged-in admin before any write. */
async function requireAdmin(): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Please log in." };
  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!me?.is_admin) return { ok: false, message: "Only admins can add fixtures." };
  return { ok: true };
}

/**
 * Admin-only: add a fixture by hand (used for pre-season friendlies, which the
 * football data feed doesn't cover). Manual fixtures get a NEGATIVE id so they
 * can never collide with a real football-data.org id (those are positive), and
 * is_manual=true so the daily sync leaves them alone.
 */
export async function addFixture(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const opponent = String(formData.get("opponent") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim(); // YYYY-MM-DD
  const time = String(formData.get("time") ?? "").trim(); // HH:MM
  const venue = String(formData.get("venue") ?? "home"); // "home" | "away"
  const competition =
    String(formData.get("competition") ?? "").trim() || "Pre-season friendly";

  if (!opponent) return { ok: false, message: "Please enter the opponent." };
  if (!date) return { ok: false, message: "Please pick a date." };

  // Combine the date + time into a timestamp. If no time is given, default to
  // 15:00 so the fixture still sorts sensibly.
  const kickoff = new Date(`${date}T${time || "15:00"}:00`);
  if (Number.isNaN(kickoff.getTime())) {
    return { ok: false, message: "That date/time didn't look right." };
  }

  const chelseaHome = venue === "home";
  const homeTeam = chelseaHome ? "Chelsea" : opponent;
  const awayTeam = chelseaHome ? opponent : "Chelsea";

  const admin = createAdminClient();
  const { error } = await admin.from("fixtures").insert({
    id: -Date.now(), // negative = manual, never clashes with the real feed
    season: String(kickoff.getUTCFullYear()),
    competition,
    home_team: homeTeam,
    away_team: awayTeam,
    chelsea_home: chelseaHome,
    opponent,
    kickoff: kickoff.toISOString(),
    status: "SCHEDULED",
    is_manual: true,
    updated_at: new Date().toISOString(),
  });

  if (error) return { ok: false, message: "Could not save. Please try again." };
  revalidatePath("/admin/fixtures");
  revalidatePath("/");
  return { ok: true, message: `Added ${homeTeam} v ${awayTeam}.` };
}

/** Admin-only: remove a hand-added fixture. Only manual (negative-id) rows. */
export async function deleteFixture(id: number): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const admin = createAdminClient();
  const { error } = await admin
    .from("fixtures")
    .delete()
    .eq("id", id)
    .eq("is_manual", true);

  if (error) return { ok: false, message: "Could not delete." };
  revalidatePath("/admin/fixtures");
  revalidatePath("/");
  return { ok: true, message: "Removed." };
}
