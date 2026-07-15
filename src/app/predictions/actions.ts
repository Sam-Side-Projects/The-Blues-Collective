"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { scoreFixture } from "@/lib/scoreFixture";

export type PredictionResult = { ok: boolean; message: string };

export type PredictionSlotInput = {
  slotId: string;
  role: string;
  playerId: number | null;
  playerName: string | null;
};

/**
 * Save (or update) the logged-in user's predicted XI for a fixture.
 * Predictions lock at kickoff and there's one per user per fixture.
 */
export async function savePrediction(input: {
  fixtureId: number;
  formation: string;
  slots: PredictionSlotInput[];
}): Promise<PredictionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Please log in to submit a prediction." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_banned")
    .eq("id", user.id)
    .single();
  if (profile?.is_banned) {
    return { ok: false, message: "Your account has been suspended." };
  }

  // Fixture must exist and not have kicked off yet.
  const { data: fixture } = await supabase
    .from("fixtures")
    .select("id, kickoff")
    .eq("id", input.fixtureId)
    .maybeSingle();
  if (!fixture) return { ok: false, message: "That fixture could not be found." };
  if (new Date(fixture.kickoff).getTime() <= Date.now()) {
    return { ok: false, message: "Predictions for this match are locked — it has kicked off." };
  }

  const filled = input.slots.filter((s) => s.playerId != null).length;
  if (filled < 11) {
    return { ok: false, message: `Pick all 11 players first — you have ${filled}/11.` };
  }

  // One prediction per user per fixture: update if they already have one.
  const { data: existing } = await supabase
    .from("lineups")
    .select("id")
    .eq("owner", user.id)
    .eq("fixture_id", input.fixtureId)
    .eq("is_prediction", true)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("lineups")
      .update({ formation: input.formation, slots: input.slots })
      .eq("id", existing.id);
    if (error) return { ok: false, message: "Could not update your prediction. Please try again." };
  } else {
    const { error } = await supabase.from("lineups").insert({
      owner: user.id,
      title: "Prediction",
      formation: input.formation,
      slots: input.slots,
      fixture_id: input.fixtureId,
      is_prediction: true,
    });
    if (error) return { ok: false, message: "Could not save your prediction. Please try again." };
  }

  revalidatePath("/predictions");
  return { ok: true, message: existing ? "Prediction updated!" : "Prediction locked in — good luck!" };
}

/**
 * Admin-only: score a fixture now against its stored confirmed lineup. Useful
 * for testing the scoring without waiting for the matchday cron job.
 */
export async function scoreFixtureNow(fixtureId: number): Promise<PredictionResult> {
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
  if (!me?.is_admin) return { ok: false, message: "Only admins can score fixtures." };

  const admin = createAdminClient();
  const res = await scoreFixture(admin, fixtureId);
  revalidatePath("/predictions");
  return { ok: res.ok, message: res.message };
}
