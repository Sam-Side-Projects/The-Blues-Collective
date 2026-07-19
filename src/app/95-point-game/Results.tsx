"use client";

import { useMemo } from "react";
import {
  ratePlayers,
  bestSix,
  verdict,
  SLOTS,
  STARTING_BANKROLL,
  POINTS_TO_BEAT,
  FILLER_COUNT,
  FILLER_RATING,
  POINTS_SLOPE,
  POINTS_INTERCEPT,
  type Player,
  type SlotId,
} from "@/lib/game95";
import ShareCard from "./ShareCard";

type Signing = {
  slotId: string;
  player: Player;
  season: string;
  price: number;
};

function slotLabel(id: string): string {
  return SLOTS.find((s) => s.id === id)?.label ?? id;
}

export default function Results({
  signings,
  players,
  spent,
  bankroll,
  onReset,
  canPost = false,
  weekText = "Practice game",
}: {
  signings: Signing[];
  players: Player[];
  spent: number;
  bankroll: number;
  onReset: () => void;
  canPost?: boolean;
  weekText?: string;
}) {
  const yours = useMemo(
    () =>
      ratePlayers(
        signings.map((s) => ({
          slotId: s.slotId as SlotId,
          attack: s.player.attack,
          defence: s.player.defence,
        }))
      ),
    [signings]
  );

  const draws = useMemo(
    () => signings.map((s) => ({ slotId: s.slotId as SlotId, season: s.season })),
    [signings]
  );

  // "The best six you could have signed" — on the full £500m, same seasons.
  const best = useMemo(
    () => bestSix(players, draws, STARTING_BANKROLL),
    [players, draws]
  );

  const v = verdict(yours.projectedPoints);
  const gap = best ? best.rating.projectedPoints - yours.projectedPoints : 0;

  return (
    <section className="mt-5 space-y-4">
      {/* Verdict banner */}
      <div
        className={`rounded-2xl p-5 text-center ${
          v.beat ? "bg-amber-400 text-brand-dark" : "bg-white/10"
        }`}
      >
        <div className="text-[11px] font-bold uppercase tracking-widest opacity-80">
          Projected league points
        </div>
        <div className="text-5xl font-black">{yours.projectedPoints}</div>
        <div className="mt-1 text-sm font-semibold">{v.headline}</div>
        <div
          className={`mt-1 text-xs ${v.beat ? "text-brand-dark/70" : "text-slate-400"}`}
        >
          Benchmark: {POINTS_TO_BEAT} points (Chelsea 2004-05)
        </div>
      </div>

      {/* Your six */}
      <div className="rounded-2xl bg-white/10 p-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-amber-300">
          Your spine · £{spent}m spent · £{bankroll}m unused
        </h3>
        <ul className="mt-2 space-y-1 text-sm">
          {signings.map((s) => (
            <li
              key={s.slotId}
              className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2"
            >
              <span>
                <span className="mr-2 inline-block w-8 font-black text-amber-300">
                  {slotLabel(s.slotId)}
                </span>
                {s.player.name}
                <span className="ml-2 text-[11px] text-slate-400">
                  {s.season}
                </span>
              </span>
              <span className="text-slate-300">£{s.price}m</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Visible working */}
      <div className="rounded-2xl bg-white/10 p-4 text-sm">
        <h3 className="text-sm font-bold uppercase tracking-wide text-amber-300">
          How this was worked out
        </h3>
        <p className="mt-1 text-xs text-slate-400">
          This is a rating-based estimate, not a simulation.
        </p>
        <div className="mt-3 space-y-2 text-slate-200">
          <p>
            Your XI = 6 signings + {FILLER_COUNT} squad fillers (each rated{" "}
            {FILLER_RATING}). Each player is judged on his position&apos;s job —
            keepers &amp; defenders on defence, strikers &amp; wingers on attack,
            midfielders on both.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-white/5 p-3 text-center">
              <div className="text-[10px] uppercase tracking-widest text-slate-400">
                Team Attack
              </div>
              <div className="text-2xl font-black text-amber-300">
                {yours.teamAttack}
              </div>
            </div>
            <div className="rounded-lg bg-white/5 p-3 text-center">
              <div className="text-[10px] uppercase tracking-widest text-slate-400">
                Team Defence
              </div>
              <div className="text-2xl font-black text-amber-300">
                {yours.teamDefence}
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-300">
            Overall = (Attack {yours.teamAttack} + Defence {yours.teamDefence}) ÷
            2 = <strong>{yours.overall}</strong>
          </p>
          <p className="text-xs text-slate-300">
            Projected points = {POINTS_SLOPE} × {yours.overall} −{" "}
            {Math.abs(POINTS_INTERCEPT)} ={" "}
            <strong className="text-amber-300">{yours.projectedPoints}</strong>
          </p>
          <p className="text-xs text-slate-400">
            Estimated goals conceded over a season: ~{yours.projectedConceded}{" "}
            (2004-05 conceded 15).
          </p>
          <p className="text-[10px] text-slate-500">
            Team Attack &amp; Defence are position-weighted averages of your six
            signings and the five fillers.
          </p>
        </div>
      </div>

      {/* Regret reveal */}
      {best && (
        <div className="rounded-2xl border-2 border-amber-400 bg-white/10 p-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-amber-300">
            The best six you could have signed
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            Same seasons you spun, on the full £{STARTING_BANKROLL}m —{" "}
            {gap > 0 ? (
              <>
                worth{" "}
                <strong className="text-amber-300">
                  {best.rating.projectedPoints} points
                </strong>
                , {gap} more than you.
              </>
            ) : (
              <>you found the best possible line-up. Nothing left on the table.</>
            )}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {best.picks.map((p, i) => {
              const mine = signings[i];
              const samePlayer = mine?.player.id === p.id;
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2"
                >
                  <span>
                    <span className="mr-2 inline-block w-8 font-black text-amber-300">
                      {slotLabel(draws[i].slotId)}
                    </span>
                    {p.name}
                    <span className="ml-2 text-[11px] text-slate-400">
                      {draws[i].season}
                    </span>
                    {samePlayer && (
                      <span className="ml-2 text-[10px] font-bold text-emerald-400">
                        ✓ you had him
                      </span>
                    )}
                  </span>
                  <span className="text-slate-300">£{p.priceM}m</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-slate-400">
            Best six cost £{best.spent}m.
          </p>
        </div>
      )}

      {/* Shareable card */}
      <ShareCard
        picks={signings.map((s) => ({
          slot: slotLabel(s.slotId),
          name: s.player.name,
          season: s.season,
          price: s.price,
        }))}
        projectedPoints={yours.projectedPoints}
        weekText={weekText}
        canPost={canPost}
      />

      <button
        onClick={onReset}
        className="w-full rounded-xl bg-amber-400 px-6 py-3 font-bold text-brand-dark hover:bg-amber-300"
      >
        Play again
      </button>
    </section>
  );
}
