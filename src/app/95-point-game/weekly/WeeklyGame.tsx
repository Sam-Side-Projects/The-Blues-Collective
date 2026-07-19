"use client";

import { useCallback, useMemo, useState } from "react";
import {
  SLOTS,
  STARTING_BANKROLL,
  eligiblePlayers,
  type Player,
  type SlotDef,
  type Draw,
} from "@/lib/game95";
import Results from "../Results";
import { saveWeeklyResult, type WeeklyPick } from "./actions";

type Signing = {
  slotId: string;
  player: Player;
  season: string;
  price: number;
};

export default function WeeklyGame({
  players,
  draws,
  weekText,
  canPost,
}: {
  players: Player[];
  draws: Draw[];
  weekText: string;
  canPost: boolean;
}) {
  const [bankroll, setBankroll] = useState(STARTING_BANKROLL);
  const [signings, setSignings] = useState<Signing[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const slotIndex = signings.length;
  const currentDraw: Draw | undefined = draws[slotIndex];
  const currentSlot: SlotDef | undefined = SLOTS.find(
    (s) => s.id === currentDraw?.slotId
  );
  const done = slotIndex >= draws.length;

  const signedIds = useMemo(
    () => new Set(signings.map((s) => s.player.id)),
    [signings]
  );

  const options = useMemo(() => {
    if (!currentSlot || !currentDraw) return [];
    return eligiblePlayers(players, currentDraw.season, currentSlot, signedIds);
  }, [players, currentSlot, currentDraw, signedIds]);

  const sign = useCallback(
    (player: Player) => {
      if (!currentSlot || !currentDraw) return;
      if (player.priceM > bankroll) {
        setMessage(
          `${player.name} costs £${player.priceM}m but you only have £${bankroll}m left.`
        );
        return;
      }
      setSignings((prev) => [
        ...prev,
        {
          slotId: currentSlot.id,
          player,
          season: currentDraw.season,
          price: player.priceM,
        },
      ]);
      setBankroll((b) => b - player.priceM);
      setMessage("");
    },
    [currentSlot, currentDraw, bankroll]
  );

  const reset = useCallback(() => {
    setBankroll(STARTING_BANKROLL);
    setSignings([]);
    setMessage("");
  }, []);

  const submit = useCallback(async () => {
    setSaving(true);
    setMessage("");
    const picks: WeeklyPick[] = signings.map((s) => ({
      slotId: s.slotId as WeeklyPick["slotId"],
      playerId: s.player.id,
    }));
    const res = await saveWeeklyResult(picks);
    setSaving(false);
    if (res.ok) setSaved(res.message);
    else setMessage(res.message);
  }, [signings]);

  const spent = STARTING_BANKROLL - bankroll;

  return (
    <div>
      {/* Bankroll */}
      <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-300">
            Bankroll left
          </div>
          <div className="text-2xl font-black text-amber-400">£{bankroll}m</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-300">
            Signed
          </div>
          <div className="text-2xl font-black text-white">
            {signings.length}
            <span className="text-slate-400">/6</span>
          </div>
        </div>
      </div>

      {/* The six fixed seasons */}
      <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-emerald-900/40 p-3 ring-1 ring-white/10 sm:grid-cols-6">
        {draws.map((d, i) => {
          const s = SLOTS.find((x) => x.id === d.slotId)!;
          const filled = signings[i];
          const active = !done && i === slotIndex;
          return (
            <div
              key={d.slotId}
              className={`flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-3 text-center ${
                filled
                  ? "border-amber-400 bg-brand-dark text-white"
                  : active
                    ? "border-amber-400 border-dashed bg-brand/20 text-amber-100"
                    : "border-white/20 border-dashed bg-white/5 text-slate-300"
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wide text-amber-300">
                {s.label} · {d.season}
              </span>
              {filled ? (
                <span className="text-sm font-bold leading-tight">
                  {filled.player.name}
                </span>
              ) : (
                <span className="text-xs text-slate-400">
                  {active ? "Pick now…" : "—"}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-400">
        Everyone gets these same six seasons this week. Your other five outfield
        places are generic squad players.
      </p>

      {/* Play / submit */}
      {!done ? (
        <section className="mt-5 rounded-2xl bg-white/10 p-4">
          <div className="text-center text-[11px] font-bold uppercase tracking-widest text-amber-300">
            Now signing · {currentSlot?.longLabel} · {currentDraw?.season}
          </div>
          <ul className="mt-3 space-y-2">
            {options.map((p) => {
              const affordable = p.priceM <= bankroll;
              return (
                <li key={p.id}>
                  <button
                    onClick={() => sign(p)}
                    disabled={!affordable}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left ${
                      affordable
                        ? "border-white/20 bg-white/5 hover:border-amber-400 hover:bg-white/10"
                        : "border-white/10 bg-white/5 opacity-40"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-white">
                        {p.name}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {p.slots.join("/")}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="flex gap-1 text-[10px] font-bold">
                        <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-rose-300">
                          ATK {p.attack}
                        </span>
                        <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-sky-300">
                          DEF {p.defence}
                        </span>
                      </span>
                      <span className="font-black text-amber-300">
                        £{p.priceM}m
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {message && (
            <p className="mt-3 rounded-lg bg-amber-400/15 px-3 py-2 text-center text-sm text-amber-200">
              {message}
            </p>
          )}
          {signings.length > 0 && (
            <button
              onClick={reset}
              className="mt-3 w-full text-xs text-slate-400 underline hover:text-slate-200"
            >
              Start over
            </button>
          )}
        </section>
      ) : (
        <div className="mt-5">
          {/* Submit-for-score bar (weekly only) */}
          {saved ? (
            <p className="rounded-xl bg-amber-400/15 px-4 py-3 text-center text-sm font-semibold text-amber-200">
              {saved}
            </p>
          ) : canPost ? (
            <button
              onClick={submit}
              disabled={saving}
              className="w-full rounded-xl bg-amber-400 px-6 py-3 font-bold text-brand-dark hover:bg-amber-300 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Submit this week's score to the leaderboard"}
            </button>
          ) : (
            <p className="rounded-xl bg-white/10 px-4 py-3 text-center text-sm text-slate-300">
              Log in to submit your score to the weekly leaderboard. You can
              still see your result below.
            </p>
          )}
          {message && (
            <p className="mt-2 rounded-lg bg-amber-400/15 px-3 py-2 text-center text-sm text-amber-200">
              {message}
            </p>
          )}

          <Results
            signings={signings}
            players={players}
            spent={spent}
            bankroll={bankroll}
            onReset={reset}
            canPost={canPost}
            weekText={weekText}
          />
        </div>
      )}
    </div>
  );
}
