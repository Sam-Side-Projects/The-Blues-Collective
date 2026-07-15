"use client";

import { useMemo, useState, useTransition } from "react";
import { publishRebuild, type RebuildMoves, type MovePlayer } from "./actions";

const WINDOW_BUDGET = 250;
const LOAN_IN_RATE = 0.1;

type Player = MovePlayer;

export default function GmMode({
  squad,
  targets,
  isLoggedIn,
  lastUpdated,
}: {
  squad: Player[];
  targets: Player[];
  isLoggedIn: boolean;
  lastUpdated?: string;
}) {
  // Sets of player names in each bucket.
  const [sold, setSold] = useState<Set<string>>(new Set());
  const [loanedOut, setLoanedOut] = useState<Set<string>>(new Set());
  const [bought, setBought] = useState<Set<string>>(new Set());
  const [loanedIn, setLoanedIn] = useState<Set<string>>(new Set());

  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [postToFeed, setPostToFeed] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const squadByName = useMemo(
    () => new Map(squad.map((p) => [p.name, p])),
    [squad]
  );
  const targetByName = useMemo(
    () => new Map(targets.map((p) => [p.name, p])),
    [targets]
  );

  // Budget maths (mirrors the server).
  const raised = useMemo(() => {
    let r = 0;
    for (const n of sold) r += squadByName.get(n)?.value ?? 0;
    return Math.round(r * 10) / 10;
  }, [sold, squadByName]);

  const spend = useMemo(() => {
    let s = 0;
    for (const n of bought) s += targetByName.get(n)?.value ?? 0;
    for (const n of loanedIn) s += (targetByName.get(n)?.value ?? 0) * LOAN_IN_RATE;
    return Math.round(s * 10) / 10;
  }, [bought, loanedIn, targetByName]);

  const budgetLeft = Math.round((WINDOW_BUDGET + raised - spend) * 10) / 10;
  const net = Math.round((spend - raised) * 10) / 10;
  const overBudget = budgetLeft < 0;

  function toggle(
    set: Set<string>,
    setter: (s: Set<string>) => void,
    name: string
  ) {
    const next = new Set(set);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setter(next);
    setMsg(null);
  }

  // For squad players: a player can be either sold OR loaned out, not both.
  function toggleSell(name: string) {
    if (loanedOut.has(name)) {
      const lo = new Set(loanedOut);
      lo.delete(name);
      setLoanedOut(lo);
    }
    toggle(sold, setSold, name);
  }
  function toggleLoanOut(name: string) {
    if (sold.has(name)) {
      const s = new Set(sold);
      s.delete(name);
      setSold(s);
    }
    toggle(loanedOut, setLoanedOut, name);
  }
  // For targets: buy OR loan-in, not both. Attempting to buy when over budget is blocked.
  function toggleBuy(name: string) {
    if (loanedIn.has(name)) {
      const li = new Set(loanedIn);
      li.delete(name);
      setLoanedIn(li);
    }
    if (!bought.has(name)) {
      const cost = targetByName.get(name)?.value ?? 0;
      if (budgetLeft - cost < 0) {
        setMsg({
          ok: false,
          text: `Can't sign ${name} (€${cost}m) — you'd go €${Math.abs(
            Math.round((budgetLeft - cost) * 10) / 10
          )}m over budget. Sell a player first.`,
        });
        return;
      }
    }
    toggle(bought, setBought, name);
  }
  function toggleLoanIn(name: string) {
    if (bought.has(name)) {
      const b = new Set(bought);
      b.delete(name);
      setBought(b);
    }
    if (!loanedIn.has(name)) {
      const cost = (targetByName.get(name)?.value ?? 0) * LOAN_IN_RATE;
      if (budgetLeft - cost < 0) {
        setMsg({
          ok: false,
          text: `Can't loan ${name} (€${Math.round(cost * 10) / 10}m fee) — that goes over budget.`,
        });
        return;
      }
    }
    toggle(loanedIn, setLoanedIn, name);
  }

  function buildMoves(): RebuildMoves {
    const pick = (names: Set<string>, src: Map<string, Player>) =>
      [...names].map((n) => src.get(n)!).filter(Boolean);
    return {
      sold: pick(sold, squadByName),
      loaned_out: pick(loanedOut, squadByName),
      bought: pick(bought, targetByName),
      loaned_in: pick(loanedIn, targetByName),
    };
  }

  function publish() {
    setMsg(null);
    startTransition(async () => {
      const r = await publishRebuild({
        title,
        moves: buildMoves(),
        note,
        postToFeed,
      });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) {
        setSold(new Set());
        setLoanedOut(new Set());
        setBought(new Set());
        setLoanedIn(new Set());
        setTitle("");
        setNote("");
      }
    });
  }

  const totalMoves =
    sold.size + loanedOut.size + bought.size + loanedIn.size;

  return (
    <div className="space-y-6">
      {/* Budget bar */}
      <div className="sticky top-14 z-20 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          <Stat label="Budget left" value={`€${budgetLeft}m`} highlight={overBudget ? "bad" : "good"} />
          <Stat label="Raised (sales)" value={`€${raised}m`} />
          <Stat label="Spend" value={`€${spend}m`} />
          <Stat label="Net spend" value={`€${net}m`} />
        </div>
        {overBudget && (
          <p className="mt-2 text-center text-sm font-semibold text-red-600">
            Over budget — sell a player or drop a signing before publishing.
          </p>
        )}
      </div>

      {msg && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Current squad — sell / loan out */}
        <section>
          <h2 className="mb-2 font-bold text-brand-dark">
            Current squad — sell or loan out
          </h2>
          <p className="mb-2 text-xs text-slate-500">
            Selling adds a player&apos;s value to your budget. Loaning out
            doesn&apos;t raise money. Values are community estimates.
          </p>
          <ul className="space-y-1">
            {squad.map((p) => (
              <PlayerRow
                key={p.name}
                player={p}
                leftLabel="Sell"
                leftActive={sold.has(p.name)}
                onLeft={() => toggleSell(p.name)}
                rightLabel="Loan out"
                rightActive={loanedOut.has(p.name)}
                onRight={() => toggleLoanOut(p.name)}
              />
            ))}
          </ul>
        </section>

        {/* Targets — buy / loan in */}
        <section>
          <h2 className="mb-2 font-bold text-brand-dark">
            Transfer targets — buy or loan in
          </h2>
          <p className="mb-2 text-xs text-slate-500">
            Buying costs the full value. Loaning in costs 10% of value.
          </p>
          <ul className="space-y-1">
            {targets.map((p) => (
              <PlayerRow
                key={p.name}
                player={p}
                leftLabel="Buy"
                leftActive={bought.has(p.name)}
                onLeft={() => toggleBuy(p.name)}
                rightLabel={`Loan (€${Math.round(p.value * LOAN_IN_RATE * 10) / 10}m)`}
                rightActive={loanedIn.has(p.name)}
                onRight={() => toggleLoanIn(p.name)}
              />
            ))}
          </ul>
          {lastUpdated && (
            <p className="mt-2 text-xs text-slate-400">
              Values last updated by hand: {lastUpdated}
            </p>
          )}
        </section>
      </div>

      {/* Publish panel */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-bold text-brand-dark">Publish your rebuild</h2>
        <div className="mt-3 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Give your rebuild a name (e.g. Summer overhaul)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="A short note on your thinking (optional)…"
            className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={postToFeed}
              onChange={(e) => setPostToFeed(e.target.checked)}
            />
            Also post to The Shed
          </label>

          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">{totalMoves} move{totalMoves === 1 ? "" : "s"}</span>
            <button
              onClick={publish}
              disabled={pending || !isLoggedIn || overBudget || totalMoves === 0}
              className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {pending ? "Publishing…" : "Post my rebuild"}
            </button>
          </div>
          {!isLoggedIn && (
            <p className="text-right text-xs text-slate-500">
              Log in to publish your rebuild.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "good" | "bad";
}) {
  return (
    <div>
      <div
        className={`text-lg font-extrabold ${
          highlight === "bad"
            ? "text-red-600"
            : highlight === "good"
              ? "text-brand"
              : "text-slate-800"
        }`}
      >
        {value}
      </div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function PlayerRow({
  player,
  leftLabel,
  leftActive,
  onLeft,
  rightLabel,
  rightActive,
  onRight,
}: {
  player: Player;
  leftLabel: string;
  leftActive: boolean;
  onLeft: () => void;
  rightLabel: string;
  rightActive: boolean;
  onRight: () => void;
}) {
  const dimmed = leftActive || rightActive;
  return (
    <li
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
        dimmed ? "border-brand/40 bg-blue-50" : "border-slate-200 bg-white"
      }`}
    >
      <span className="w-9 shrink-0 text-xs font-bold text-slate-400">
        {player.position}
      </span>
      <span className="flex-1 truncate">
        <span className="font-medium text-slate-800">{player.name}</span>
        <span className="ml-1 text-xs text-slate-400">{player.club}</span>
      </span>
      <span className="w-14 shrink-0 text-right text-xs text-slate-500">
        €{player.value}m
      </span>
      <button
        onClick={onLeft}
        className={`shrink-0 rounded px-2 py-1 text-xs font-semibold ${
          leftActive
            ? "bg-brand text-white"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
      >
        {leftLabel}
      </button>
      <button
        onClick={onRight}
        className={`shrink-0 rounded px-2 py-1 text-xs font-semibold ${
          rightActive
            ? "bg-brand-dark text-white"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
      >
        {rightLabel}
      </button>
    </li>
  );
}
