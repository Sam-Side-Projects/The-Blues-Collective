"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  SLOTS,
  STARTING_BANKROLL,
  RESPIN_COST,
  POINTS_TO_BEAT,
  eligiblePlayers,
  drawableSeasons,
  type Player,
  type SlotDef,
} from "@/lib/game95";
import Results from "./Results";

type Signing = {
  slotId: string;
  player: Player;
  season: string;
  price: number;
};

/** A single filled-in signing shown on the pitch. */
function PitchSlot({
  slot,
  signing,
  active,
}: {
  slot: SlotDef;
  signing: Signing | undefined;
  active: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-3 text-center transition-colors ${
        signing
          ? "border-amber-400 bg-brand-dark text-white"
          : active
            ? "border-amber-400 border-dashed bg-brand/20 text-amber-100"
            : "border-white/20 border-dashed bg-white/5 text-slate-300"
      }`}
    >
      <span className="text-[10px] font-bold uppercase tracking-wide text-amber-300">
        {slot.longLabel}
      </span>
      {signing ? (
        <>
          <span className="text-sm font-bold leading-tight">
            {signing.player.name}
          </span>
          <span className="text-[11px] text-slate-300">
            {signing.season} · £{signing.price}m
          </span>
        </>
      ) : (
        <span className="text-xs text-slate-400">
          {active ? "Signing now…" : "Empty"}
        </span>
      )}
    </div>
  );
}

export default function Game({
  players,
  seasons,
  canPost = false,
}: {
  players: Player[];
  seasons: string[];
  canPost?: boolean;
}) {
  const [bankroll, setBankroll] = useState(STARTING_BANKROLL);
  const [signings, setSignings] = useState<Signing[]>([]);
  const [drawnSeason, setDrawnSeason] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [spinLabel, setSpinLabel] = useState<string>("—");
  const [message, setMessage] = useState<string>("");
  const spinTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const slotIndex = signings.length;
  const currentSlot: SlotDef | undefined = SLOTS[slotIndex];
  const done = slotIndex >= SLOTS.length;

  const signedIds = useMemo(
    () => new Set(signings.map((s) => s.player.id)),
    [signings]
  );

  // Players you can pick from the currently-drawn season for the current slot.
  const options = useMemo(() => {
    if (!currentSlot || !drawnSeason) return [];
    return eligiblePlayers(players, drawnSeason, currentSlot, signedIds);
  }, [players, drawnSeason, currentSlot, signedIds]);

  /** Land the wheel on a random season that has a valid pick for this slot. */
  const landSpin = useCallback(
    (chargeRespin: boolean) => {
      if (!currentSlot) return;
      const pool = drawableSeasons(players, seasons, currentSlot, signedIds);
      if (pool.length === 0) {
        setMessage("No seasons left with a player for this position.");
        return;
      }

      if (chargeRespin) setBankroll((b) => b - RESPIN_COST);
      setMessage("");
      setSpinning(true);

      // Quick visual cycle through seasons before settling on the result.
      let ticks = 0;
      const totalTicks = 16;
      const final = pool[Math.floor(Math.random() * pool.length)];
      if (spinTimer.current) clearInterval(spinTimer.current);
      spinTimer.current = setInterval(() => {
        ticks++;
        setSpinLabel(seasons[Math.floor(Math.random() * seasons.length)]);
        if (ticks >= totalTicks) {
          if (spinTimer.current) clearInterval(spinTimer.current);
          setSpinLabel(final);
          setDrawnSeason(final);
          setSpinning(false);
        }
      }, 60);
    },
    [currentSlot, players, seasons, signedIds]
  );

  const spin = useCallback(() => landSpin(false), [landSpin]);

  const respin = useCallback(() => {
    if (bankroll < RESPIN_COST) {
      setMessage(
        `A re-spin costs £${RESPIN_COST}m and you only have £${bankroll}m left. You'll have to pick from this season.`
      );
      return;
    }
    landSpin(true);
  }, [bankroll, landSpin]);

  const sign = useCallback(
    (player: Player) => {
      if (!currentSlot || !drawnSeason) return;
      if (player.priceM > bankroll) {
        setMessage(
          `${player.name} costs £${player.priceM}m but you only have £${bankroll}m. Pick someone cheaper or re-spin.`
        );
        return;
      }
      setSignings((prev) => [
        ...prev,
        {
          slotId: currentSlot.id,
          player,
          season: drawnSeason,
          price: player.priceM,
        },
      ]);
      setBankroll((b) => b - player.priceM);
      setDrawnSeason(null);
      setSpinLabel("—");
      setMessage("");
    },
    [currentSlot, drawnSeason, bankroll]
  );

  const reset = useCallback(() => {
    if (spinTimer.current) clearInterval(spinTimer.current);
    setBankroll(STARTING_BANKROLL);
    setSignings([]);
    setDrawnSeason(null);
    setSpinning(false);
    setSpinLabel("—");
    setMessage("");
  }, []);

  const spent = STARTING_BANKROLL - bankroll;

  return (
    <div className="min-h-full bg-brand-dark">
      <main className="mx-auto max-w-3xl px-4 py-6 text-white">
        {/* Header */}
        <header className="text-center">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            The <span className="text-amber-400">95-Point</span> Game
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-300">
            Chelsea&apos;s 2004-05 side took{" "}
            <strong className="text-amber-300">{POINTS_TO_BEAT} points</strong>{" "}
            and conceded just 15. Build a six-player spine from any era on a{" "}
            <strong className="text-amber-300">£{STARTING_BANKROLL}m</strong>{" "}
            budget — can you beat it?
          </p>
          <p className="mt-3 text-xs">
            <span className="rounded-full bg-white/10 px-3 py-1 text-slate-300">
              Practice mode
            </span>
            <a
              href="/95-point-game/weekly"
              className="ml-2 rounded-full bg-amber-400 px-3 py-1 font-semibold text-brand-dark hover:bg-amber-300"
            >
              This week&apos;s challenge →
            </a>
          </p>
        </header>

        {/* Bankroll + progress */}
        <div className="mt-5 flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
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
            <div className="text-2xl font-black">
              {signings.length}
              <span className="text-slate-400">/6</span>
            </div>
          </div>
        </div>

        {/* Pitch: 6 spine slots */}
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-emerald-900/40 p-3 ring-1 ring-white/10 sm:grid-cols-6">
          {SLOTS.map((slot, i) => (
            <PitchSlot
              key={slot.id}
              slot={slot}
              signing={signings[i]}
              active={!done && i === slotIndex}
            />
          ))}
        </div>
        <p className="mt-2 text-center text-[11px] text-slate-400">
          Your other five outfield places are filled by generic squad players.
        </p>

        {/* Game controls */}
        {!done ? (
          <section className="mt-5 rounded-2xl bg-white/10 p-4">
            <div className="text-center">
              <div className="text-[11px] font-bold uppercase tracking-widest text-amber-300">
                Now signing · {currentSlot?.longLabel}
              </div>

              {/* Wheel display */}
              <div
                className={`mx-auto mt-3 w-48 rounded-xl border-2 py-4 text-3xl font-black tracking-tight ${
                  spinning
                    ? "border-amber-400 text-amber-300"
                    : drawnSeason
                      ? "border-amber-400 text-white"
                      : "border-white/20 text-slate-400"
                }`}
              >
                {spinLabel}
              </div>

              {!drawnSeason ? (
                <button
                  onClick={spin}
                  disabled={spinning}
                  className="mt-4 rounded-xl bg-amber-400 px-6 py-3 text-base font-bold text-brand-dark hover:bg-amber-300 disabled:opacity-60"
                >
                  {spinning ? "Spinning…" : "Spin the wheel"}
                </button>
              ) : (
                <p className="mt-3 text-sm text-slate-200">
                  Landed on <strong className="text-amber-300">{drawnSeason}</strong>{" "}
                  — sign a {currentSlot?.longLabel.toLowerCase()} below, or
                  re-spin.
                </p>
              )}
            </div>

            {/* Player options for the drawn season */}
            {drawnSeason && !spinning && (
              <div className="mt-4">
                <ul className="space-y-2">
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
                            <span className="block truncate font-semibold">
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

                <button
                  onClick={respin}
                  className="mt-3 w-full rounded-xl border border-amber-400/50 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-400/10"
                >
                  Re-spin (−£{RESPIN_COST}m)
                </button>
              </div>
            )}

            {message && (
              <p className="mt-3 rounded-lg bg-amber-400/15 px-3 py-2 text-center text-sm text-amber-200">
                {message}
              </p>
            )}
          </section>
        ) : (
          /* Spine complete — scoring, verdict vs 95, and regret reveal */
          <Results
            signings={signings}
            players={players}
            spent={spent}
            bankroll={bankroll}
            onReset={reset}
            canPost={canPost}
          />
        )}

        {/* Reset (mid-game) */}
        {!done && signings.length > 0 && (
          <div className="mt-4 text-center">
            <button
              onClick={reset}
              className="text-xs text-slate-400 underline hover:text-slate-200"
            >
              Start over
            </button>
          </div>
        )}

        {/* Disclaimer + credit */}
        <footer className="mt-8 space-y-2 border-t border-white/10 pt-4 text-center text-[11px] text-slate-400">
          <p>
            Unofficial fan project. Not affiliated with Chelsea FC. Player prices
            and ratings are invented for game balance and are not real
            valuations.
          </p>
          <p>Game concept inspired by HoopsMatic&apos;s 73-9 Game.</p>
        </footer>
      </main>
    </div>
  );
}
