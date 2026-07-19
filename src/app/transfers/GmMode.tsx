"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  publishRebuild,
  searchPlayers,
  type RebuildMoves,
  type MovePlayer,
  type SearchedPlayer,
} from "./actions";

const WINDOW_BUDGET = 250;
const POSITIONS = ["GK", "DEF", "MID", "FWD"];

type Player = MovePlayer;

// A player the user wants to sign, with the fee they've proposed for the deal.
type Target = {
  name: string;
  position: string;
  club: string;
  age: number | null;
  mode: "buy" | "loan";
  fee: string; // kept as a string so the box can start blank (no anchor)
};

export default function GmMode({
  squad,
  isLoggedIn,
}: {
  squad: Player[];
  isLoggedIn: boolean;
}) {
  // Outgoing: squad players the user sells or loans out (values from our DB).
  const [sold, setSold] = useState<Set<string>>(new Set());
  const [loanedOut, setLoanedOut] = useState<Set<string>>(new Set());

  // Incoming: a shortlist of targets the user is signing, each with a fee.
  const [targets, setTargets] = useState<Target[]>([]);

  // Search state.
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchedPlayer[]>([]);
  const [searching, startSearch] = useTransition();

  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [postToFeed, setPostToFeed] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const squadByName = useMemo(
    () => new Map(squad.map((p) => [p.name, p])),
    [squad]
  );

  // Debounced player search — runs 300ms after the user stops typing.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      startSearch(async () => {
        const found = await searchPlayers(q);
        setResults(found);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // Budget maths (mirrors the server): sales raise money, signings spend it.
  const raised = useMemo(() => {
    let r = 0;
    for (const n of sold) r += squadByName.get(n)?.value ?? 0;
    return Math.round(r * 10) / 10;
  }, [sold, squadByName]);

  const feeOf = (t: Target) => {
    const n = parseFloat(t.fee);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const spend = useMemo(() => {
    let s = 0;
    for (const t of targets) s += feeOf(t);
    return Math.round(s * 10) / 10;
  }, [targets]);

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

  // ---- Shortlist management ----
  const inShortlist = (name: string) => targets.some((t) => t.name === name);

  function addTarget(p: { name: string; position: string; club: string; age: number | null }) {
    if (inShortlist(p.name)) return;
    setTargets((prev) => [
      ...prev,
      { name: p.name, position: p.position, club: p.club, age: p.age, mode: "buy", fee: "" },
    ]);
    setMsg(null);
  }
  function removeTarget(name: string) {
    setTargets((prev) => prev.filter((t) => t.name !== name));
  }
  function setTargetMode(name: string, mode: "buy" | "loan") {
    setTargets((prev) => prev.map((t) => (t.name === name ? { ...t, mode } : t)));
  }
  function setTargetFee(name: string, fee: string) {
    setTargets((prev) => prev.map((t) => (t.name === name ? { ...t, fee } : t)));
    setMsg(null);
  }

  // ---- Manual add (for a player not in the search pool) ----
  const [manName, setManName] = useState("");
  const [manPos, setManPos] = useState("MID");
  const [manClub, setManClub] = useState("");
  function addManual() {
    const name = manName.trim();
    const club = manClub.trim();
    if (!name) return;
    if (inShortlist(name)) {
      setMsg({ ok: false, text: `${name} is already on your shortlist.` });
      return;
    }
    addTarget({ name, position: manPos, club: club || "Unknown club", age: null });
    setManName("");
    setManClub("");
    setManPos("MID");
  }

  function buildMoves(): RebuildMoves {
    const sq = (names: Set<string>) =>
      [...names].map((n) => squadByName.get(n)!).filter(Boolean);
    const asMove = (t: Target): MovePlayer => ({
      name: t.name,
      position: t.position,
      club: t.club,
      value: feeOf(t),
    });
    return {
      sold: sq(sold),
      loaned_out: sq(loanedOut),
      bought: targets.filter((t) => t.mode === "buy").map(asMove),
      loaned_in: targets.filter((t) => t.mode === "loan").map(asMove),
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
        setTargets([]);
        setTitle("");
        setNote("");
        setQuery("");
      }
    });
  }

  const totalMoves = sold.size + loanedOut.size + targets.length;

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
            Over budget — sell a player or lower a fee before publishing.
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
            doesn&apos;t raise money.
          </p>
          <ul className="space-y-1">
            {squad.map((p) => (
              <SquadRow
                key={p.name}
                player={p}
                soldActive={sold.has(p.name)}
                onSell={() => toggleSell(p.name)}
                loanActive={loanedOut.has(p.name)}
                onLoan={() => toggleLoanOut(p.name)}
              />
            ))}
            {squad.length === 0 && (
              <li className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                Squad awaiting sync.
              </li>
            )}
          </ul>
        </section>

        {/* Targets — search, shortlist, propose fees */}
        <section>
          <h2 className="mb-2 font-bold text-brand-dark">
            Sign players — search and propose a fee
          </h2>
          <p className="mb-2 text-xs text-slate-500">
            Search any Premier League player, add them, then type the fee
            you&apos;d pay. There&apos;s no &ldquo;correct&rdquo; price — it&apos;s
            your call.
          </p>

          {/* Search box */}
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a player (e.g. Wharton)…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            {query.trim().length >= 2 && (
              <div className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {searching && (
                  <p className="px-3 py-2 text-sm text-slate-400">Searching…</p>
                )}
                {!searching && results.length === 0 && (
                  <p className="px-3 py-2 text-sm text-slate-400">
                    No players found. You can add them by hand below.
                  </p>
                )}
                {results.map((r) => (
                  <button
                    key={`${r.name}-${r.club}`}
                    onClick={() => {
                      addTarget(r);
                      setQuery("");
                    }}
                    disabled={inShortlist(r.name)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-40"
                  >
                    <span className="w-9 shrink-0 text-xs font-bold text-slate-400">
                      {r.position}
                    </span>
                    <span className="flex-1 truncate">
                      <span className="font-medium text-slate-800">{r.name}</span>
                      <span className="ml-1 text-xs text-slate-400">
                        {r.club}
                        {r.age != null ? ` · ${r.age}y` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-brand">
                      {inShortlist(r.name) ? "Added" : "+ Add"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Manual add */}
          <details className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm">
            <summary className="cursor-pointer text-xs font-semibold text-slate-600">
              Can&apos;t find someone? Add them by hand
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                value={manName}
                onChange={(e) => setManName(e.target.value)}
                placeholder="Player name"
                className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:border-brand focus:outline-none"
              />
              <select
                value={manPos}
                onChange={(e) => setManPos(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1 text-sm focus:border-brand focus:outline-none"
              >
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <input
                value={manClub}
                onChange={(e) => setManClub(e.target.value)}
                placeholder="Club"
                className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:border-brand focus:outline-none"
              />
              <button
                onClick={addManual}
                className="rounded bg-slate-700 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Add
              </button>
            </div>
          </details>

          {/* Shortlist */}
          <div className="mt-4">
            <h3 className="mb-1 text-sm font-semibold text-slate-700">
              Your shortlist ({targets.length})
            </h3>
            {targets.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                Search above to add players you&apos;d sign.
              </p>
            ) : (
              <ul className="space-y-1">
                {targets.map((t) => (
                  <TargetRow
                    key={t.name}
                    target={t}
                    onMode={(m) => setTargetMode(t.name, m)}
                    onFee={(v) => setTargetFee(t.name, v)}
                    onRemove={() => removeTarget(t.name)}
                  />
                ))}
              </ul>
            )}
          </div>
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

function SquadRow({
  player,
  soldActive,
  onSell,
  loanActive,
  onLoan,
}: {
  player: Player;
  soldActive: boolean;
  onSell: () => void;
  loanActive: boolean;
  onLoan: () => void;
}) {
  const dimmed = soldActive || loanActive;
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
        onClick={onSell}
        className={`shrink-0 rounded px-2 py-1 text-xs font-semibold ${
          soldActive ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
      >
        Sell
      </button>
      <button
        onClick={onLoan}
        className={`shrink-0 rounded px-2 py-1 text-xs font-semibold ${
          loanActive ? "bg-brand-dark text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
      >
        Loan out
      </button>
    </li>
  );
}

function TargetRow({
  target,
  onMode,
  onFee,
  onRemove,
}: {
  target: Target;
  onMode: (m: "buy" | "loan") => void;
  onFee: (v: string) => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-brand/40 bg-blue-50 px-3 py-2 text-sm">
      <span className="w-9 shrink-0 text-xs font-bold text-slate-400">
        {target.position}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium text-slate-800">{target.name}</span>
        <span className="ml-1 text-xs text-slate-400">
          {target.club}
          {target.age != null ? ` · ${target.age}y` : ""}
        </span>
      </span>

      {/* Buy / Loan toggle */}
      <div className="flex shrink-0 overflow-hidden rounded border border-slate-300">
        <button
          onClick={() => onMode("buy")}
          className={`px-2 py-1 text-xs font-semibold ${
            target.mode === "buy" ? "bg-brand text-white" : "bg-white text-slate-600"
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => onMode("loan")}
          className={`px-2 py-1 text-xs font-semibold ${
            target.mode === "loan" ? "bg-brand-dark text-white" : "bg-white text-slate-600"
          }`}
        >
          Loan
        </button>
      </div>

      {/* Fee input — starts blank, no suggested value */}
      <label className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
        €
        <input
          type="number"
          min={0}
          step={1}
          value={target.fee}
          onChange={(e) => onFee(e.target.value)}
          placeholder="fee"
          className="w-16 rounded border border-slate-300 px-2 py-1 text-sm text-slate-800 focus:border-brand focus:outline-none"
        />
        m
      </label>

      <button
        onClick={onRemove}
        className="shrink-0 rounded px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-slate-200 hover:text-slate-700"
        aria-label={`Remove ${target.name}`}
      >
        ✕
      </button>
    </li>
  );
}
