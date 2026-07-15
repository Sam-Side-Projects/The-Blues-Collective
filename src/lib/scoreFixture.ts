/**
 * Score every prediction for one fixture against the confirmed team sheet and
 * write the results into `prediction_scores`. Runs with the admin client so it
 * can write scores regardless of who submitted each prediction.
 *
 * Called by the matchday lineup-sync cron once the real XI is confirmed, and
 * available to an admin "score now" action for testing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  scorePrediction,
  starterNames,
  type PredictionSlot,
} from "@/lib/predictions";

export type ScoreFixtureResult = {
  ok: boolean;
  scored: number;
  message: string;
};

export async function scoreFixture(
  admin: SupabaseClient,
  fixtureRef: number
): Promise<ScoreFixtureResult> {
  // 1. The confirmed team sheet for this fixture.
  const { data: confirmed } = await admin
    .from("confirmed_lineups")
    .select("formation, starters")
    .eq("fixture_ref", fixtureRef)
    .maybeSingle();

  if (!confirmed) {
    return { ok: false, scored: 0, message: "No confirmed lineup for this fixture yet." };
  }

  const confirmedNames: string[] = (confirmed.starters ?? [])
    .map((s: { player_name?: string }) => s.player_name)
    .filter(Boolean);
  const confirmedFormation: string | null = confirmed.formation ?? null;

  // 2. Every prediction submitted for this fixture.
  const { data: predictions } = await admin
    .from("lineups")
    .select("owner, formation, slots")
    .eq("fixture_id", fixtureRef)
    .eq("is_prediction", true);

  if (!predictions || predictions.length === 0) {
    return { ok: true, scored: 0, message: "No predictions to score for this fixture." };
  }

  // 3. Score each and upsert into prediction_scores.
  const rows = predictions.map((p) => {
    const predictedNames = starterNames((p.slots ?? []) as PredictionSlot[]);
    const { points, correctStarters, formationBonus } = scorePrediction(
      predictedNames,
      p.formation,
      confirmedNames,
      confirmedFormation
    );
    return {
      user_id: p.owner,
      fixture_ref: fixtureRef,
      points,
      correct_starters: correctStarters,
      formation_bonus: formationBonus,
      scored_at: new Date().toISOString(),
    };
  });

  const { error } = await admin
    .from("prediction_scores")
    .upsert(rows, { onConflict: "user_id,fixture_ref" });

  if (error) {
    return { ok: false, scored: 0, message: "Could not save the scores." };
  }

  return { ok: true, scored: rows.length, message: `Scored ${rows.length} prediction(s).` };
}
