import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import MiniPitch from "@/components/MiniPitch";
import ConsensusXI from "@/components/ConsensusXI";
import Leaderboard, { type LeaderboardRow } from "@/components/Leaderboard";
import PredictionBuilder, { type SquadPlayer } from "./PredictionBuilder";
import AdminScoreButton from "./AdminScoreButton";
import {
  buildConsensus,
  confirmedToSlots,
  type PredictionEntry,
  type PredictionSlot,
} from "@/lib/predictions";

export const metadata = { title: "Predictions — The Blues Collective" };
export const dynamic = "force-dynamic";

function fixtureLabel(f: {
  home_team: string;
  away_team: string;
}): string {
  return `${f.home_team} v ${f.away_team}`;
}

function kickoffText(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function PredictionsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  // ---------- Next fixture to predict ----------
  const { data: nextFixtures } = await supabase
    .from("fixtures")
    .select("id, home_team, away_team, opponent, kickoff, status")
    .gt("kickoff", nowIso)
    .order("kickoff", { ascending: true })
    .limit(1);
  const nextFixture = nextFixtures?.[0] ?? null;

  // ---------- Squad for the builder ----------
  const { data: squadData } = await supabase
    .from("squad_players")
    .select("id, name, position, shirt_number")
    .eq("is_active", true)
    .order("position", { ascending: true })
    .order("shirt_number", { ascending: true });
  const squad: SquadPlayer[] = (squadData ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    position: p.position,
    shirtNumber: p.shirt_number,
  }));

  // ---------- Predictions for the next fixture ----------
  let myPrediction: { formation: string; slots: PredictionSlot[] } | null = null;
  let consensus = null;
  if (nextFixture) {
    const { data: preds } = await supabase
      .from("lineups")
      .select("owner, formation, slots")
      .eq("fixture_id", nextFixture.id)
      .eq("is_prediction", true);

    const entries: PredictionEntry[] = (preds ?? []).map((p) => ({
      formation: p.formation,
      slots: (p.slots ?? []) as PredictionSlot[],
    }));
    consensus = buildConsensus(entries);

    if (user) {
      const mine = (preds ?? []).find((p) => p.owner === user.id);
      if (mine) myPrediction = { formation: mine.formation, slots: (mine.slots ?? []) as PredictionSlot[] };
    }
  }

  // ---------- Season leaderboard ----------
  const { data: scores } = await supabase
    .from("prediction_scores")
    .select("user_id, points, owner_profile:profiles!prediction_scores_user_id_fkey(username)")
    .returns<
      { user_id: string; points: number; owner_profile: { username: string } | null }[]
    >();

  const byUser = new Map<string, LeaderboardRow>();
  for (const s of scores ?? []) {
    const row = byUser.get(s.user_id) ?? {
      userId: s.user_id,
      username: s.owner_profile?.username ?? "fan",
      totalPoints: 0,
      played: 0,
      bestPoints: 0,
    };
    row.totalPoints += s.points;
    row.played += 1;
    row.bestPoints = Math.max(row.bestPoints, s.points);
    byUser.set(s.user_id, row);
  }
  const leaderboard = [...byUser.values()].sort((a, b) => b.totalPoints - a.totalPoints);

  // ---------- Latest result (most recent confirmed lineup) ----------
  const { data: confirmedRows } = await supabase
    .from("confirmed_lineups")
    .select("fixture_ref, formation, starters, created_at")
    .order("created_at", { ascending: false })
    .limit(1);
  const confirmed = confirmedRows?.[0] ?? null;

  let latestResult: {
    fixtureId: number;
    label: string;
    formation: string;
    slots: PredictionSlot[];
    myPoints: number | null;
    myCorrect: number | null;
    myBonus: boolean | null;
  } | null = null;

  if (confirmed) {
    const { data: fx } = await supabase
      .from("fixtures")
      .select("id, home_team, away_team")
      .eq("id", confirmed.fixture_ref)
      .maybeSingle();

    let myPoints: number | null = null;
    let myCorrect: number | null = null;
    let myBonus: boolean | null = null;
    if (user) {
      const { data: myScore } = await supabase
        .from("prediction_scores")
        .select("points, correct_starters, formation_bonus")
        .eq("fixture_ref", confirmed.fixture_ref)
        .eq("user_id", user.id)
        .maybeSingle();
      if (myScore) {
        myPoints = myScore.points;
        myCorrect = myScore.correct_starters;
        myBonus = myScore.formation_bonus;
      }
    }

    latestResult = {
      fixtureId: confirmed.fixture_ref,
      label: fx ? fixtureLabel(fx) : "Latest match",
      formation: confirmed.formation ?? "4-3-3",
      slots: confirmedToSlots(
        confirmed.formation ?? "4-3-3",
        (confirmed.starters ?? []) as { player_name: string; position?: string | null }[]
      ),
      myPoints,
      myCorrect,
      myBonus,
    };
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-dark">Prediction League</h1>
        <p className="mt-1 text-sm text-slate-600">
          Predict Chelsea's starting XI before kickoff. Score points for every
          player you get right, with a bonus for nailing the formation.
        </p>
      </div>

      {/* ---------- Predict the next match ---------- */}
      <section className="mb-8">
        {!nextFixture ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-slate-500">
            No upcoming fixture to predict yet. Once the fixtures feed runs, the
            next match will appear here.
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-dark px-4 py-3 text-white">
              <div>
                <p className="text-xs uppercase tracking-wide text-blue-200">
                  Next match — predict before kickoff
                </p>
                <p className="text-lg font-bold">{fixtureLabel(nextFixture)}</p>
              </div>
              <p className="text-sm text-blue-100">{kickoffText(nextFixture.kickoff)}</p>
            </div>

            {myPrediction && (
              <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                You've predicted this match — you can tweak your XI until kickoff.
              </p>
            )}

            {squad.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-slate-500">
                The squad list is empty, so there's no one to pick yet.
              </div>
            ) : (
              <PredictionBuilder
                squad={squad}
                fixtureId={nextFixture.id}
                existing={myPrediction}
                isLoggedIn={!!user}
              />
            )}
          </>
        )}
      </section>

      {/* ---------- Consensus XI ---------- */}
      {consensus && (
        <section className="mb-8">
          <ConsensusXI consensus={consensus} />
        </section>
      )}

      {/* ---------- Latest result ---------- */}
      {latestResult && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-bold text-brand-dark">Latest result</h2>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
              <div className="mx-auto w-full max-w-[200px]">
                <MiniPitch
                  formation={latestResult.formation}
                  slots={latestResult.slots}
                  title={`Confirmed XI · ${latestResult.label}`}
                />
              </div>
              <div className="flex flex-col justify-center">
                {latestResult.myPoints != null ? (
                  <div className="rounded-lg bg-blue-50 p-4">
                    <p className="text-sm text-slate-600">Your score for this match</p>
                    <p className="text-3xl font-extrabold text-brand-dark">
                      {latestResult.myPoints}{" "}
                      <span className="text-base font-semibold text-slate-500">pts</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {latestResult.myCorrect}/11 starters correct
                      {latestResult.myBonus ? " · formation bonus +3" : ""}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    {user
                      ? "You didn't submit a prediction for this match."
                      : "Log in and predict future matches to earn points."}
                  </p>
                )}
                {user?.isAdmin && (
                  <div className="mt-3">
                    <AdminScoreButton fixtureId={latestResult.fixtureId} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ---------- Season leaderboard ---------- */}
      <section>
        <h2 className="mb-3 text-lg font-bold text-brand-dark">Season leaderboard</h2>
        <Leaderboard rows={leaderboard} meId={user?.id ?? null} />
      </section>

      {!user && (
        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/login" className="font-semibold text-brand underline">
            Log in
          </Link>{" "}
          or{" "}
          <Link href="/signup" className="font-semibold text-brand underline">
            sign up
          </Link>{" "}
          to join the prediction league.
        </p>
      )}
    </div>
  );
}
