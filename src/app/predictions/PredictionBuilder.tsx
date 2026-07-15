"use client";

import { useMemo, useState } from "react";
import {
  FORMATIONS,
  FORMATION_NAMES,
  type FormationName,
  type SlotRole,
} from "@/lib/formations";
import { savePrediction, type PredictionSlotInput } from "./actions";

export type SquadPlayer = {
  id: number;
  name: string;
  position: string;
  shirtNumber: number | null;
};

type Assignments = Record<string, SquadPlayer | null>;

function fitScore(playerPos: string, role: SlotRole): number {
  if (playerPos === role) return 0;
  const adjacency: Record<SlotRole, string[]> = {
    GK: [],
    DEF: ["MID"],
    MID: ["DEF", "FWD"],
    FWD: ["MID"],
  };
  if (adjacency[role]?.includes(playerPos)) return 1;
  return 2;
}

function shortName(name: string): string {
  const parts = name.split(" ");
  return parts[parts.length - 1];
}

export default function PredictionBuilder({
  squad,
  fixtureId,
  existing,
  isLoggedIn,
}: {
  squad: SquadPlayer[];
  fixtureId: number;
  existing: { formation: string; slots: PredictionSlotInput[] } | null;
  isLoggedIn: boolean;
}) {
  // Rebuild the initial assignments from any existing prediction.
  const initialFormation = (existing?.formation as FormationName) ?? "4-3-3";
  const initialAssignments: Assignments = {};
  if (existing) {
    for (const s of existing.slots) {
      if (s.playerId != null) {
        const p = squad.find((sq) => sq.id === s.playerId);
        initialAssignments[s.slotId] = p ?? null;
      }
    }
  }

  const [formation, setFormation] = useState<FormationName>(initialFormation);
  const [assignments, setAssignments] = useState<Assignments>(initialAssignments);
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const slots = FORMATIONS[formation];
  const activeSlotDef = slots.find((s) => s.id === activeSlot) ?? null;

  const usedIds = useMemo(
    () =>
      new Set(
        Object.values(assignments)
          .filter((p): p is SquadPlayer => !!p)
          .map((p) => p.id)
      ),
    [assignments]
  );

  const pickerList = useMemo(() => {
    if (!activeSlotDef) return [];
    return [...squad].sort((a, b) => {
      const fa = fitScore(a.position, activeSlotDef.role);
      const fb = fitScore(b.position, activeSlotDef.role);
      return fa - fb;
    });
  }, [squad, activeSlotDef]);

  const filledCount = Object.values(assignments).filter(Boolean).length;

  function changeFormation(next: FormationName) {
    setFormation(next);
    setAssignments({});
    setActiveSlot(null);
    setMessage(null);
  }

  function pickPlayer(player: SquadPlayer) {
    if (!activeSlot) return;
    setAssignments((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (next[key]?.id === player.id) next[key] = null;
      }
      next[activeSlot] = player;
      return next;
    });
    setActiveSlot(null);
  }

  function clearSlot(slotId: string) {
    setAssignments((prev) => ({ ...prev, [slotId]: null }));
  }

  async function handleSubmit() {
    setBusy(true);
    setMessage(null);
    const payload: PredictionSlotInput[] = slots.map((s) => {
      const p = assignments[s.id] ?? null;
      return {
        slotId: s.id,
        role: s.role,
        playerId: p?.id ?? null,
        playerName: p?.name ?? null,
      };
    });
    const res = await savePrediction({ fixtureId, formation, slots: payload });
    setMessage({ ok: res.ok, text: res.message });
    setBusy(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-700">Formation:</span>
          {FORMATION_NAMES.map((f) => (
            <button
              key={f}
              onClick={() => changeFormation(f)}
              className={`rounded-full px-3 py-1 text-sm font-semibold transition-colors ${
                formation === f
                  ? "bg-brand text-white"
                  : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
              }`}
            >
              {f}
            </button>
          ))}
          <span className="ml-auto text-sm text-slate-500">{filledCount}/11 picked</span>
        </div>

        <Pitch
          slots={slots}
          assignments={assignments}
          onSlotClick={(id) => {
            setActiveSlot(id);
            setMessage(null);
          }}
          onClearSlot={clearSlot}
        />
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <p className="font-semibold text-brand-dark">How scoring works</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
            <li>1 point for each player you correctly predict to start</li>
            <li>+3 bonus if you also nail the exact formation</li>
            <li>Best possible score: 14 points</li>
          </ul>
        </div>

        <button
          onClick={handleSubmit}
          disabled={busy || !isLoggedIn}
          className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy
            ? "Saving…"
            : existing
              ? "Update my prediction"
              : "Lock in my prediction"}
        </button>

        {!isLoggedIn && (
          <p className="text-center text-xs text-slate-500">
            Log in to submit a prediction.
          </p>
        )}

        {message && (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${
              message.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>

      {activeSlotDef && (
        <PlayerPicker
          slotLabel={activeSlotDef.label}
          role={activeSlotDef.role}
          players={pickerList}
          usedIds={usedIds}
          currentId={assignments[activeSlotDef.id]?.id ?? null}
          onPick={pickPlayer}
          onClose={() => setActiveSlot(null)}
        />
      )}
    </div>
  );
}

function Pitch({
  slots,
  assignments,
  onSlotClick,
  onClearSlot,
}: {
  slots: (typeof FORMATIONS)[FormationName];
  assignments: Assignments;
  onSlotClick: (id: string) => void;
  onClearSlot: (id: string) => void;
}) {
  return (
    <div
      className="relative mx-auto w-full max-w-md overflow-hidden rounded-xl border-2 border-white shadow-md"
      style={{
        aspectRatio: "68 / 105",
        background: "linear-gradient(180deg, #1a7d3a 0%, #1f8f43 50%, #1a7d3a 100%)",
      }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-2 rounded border border-white/40" />
        <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40" />
      </div>

      {slots.map((s) => {
        const player = assignments[s.id];
        const top = `${100 - s.y}%`;
        const left = `${s.x}%`;
        return (
          <button
            key={s.id}
            onClick={() => onSlotClick(s.id)}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center focus:outline-none"
            style={{ top, left }}
          >
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold shadow ${
                player
                  ? "bg-brand text-white ring-2 ring-white"
                  : "bg-white/85 text-slate-500 ring-2 ring-white/60"
              }`}
            >
              {player ? player.shirtNumber ?? s.label : s.label}
            </span>
            <span className="mt-0.5 max-w-[72px] truncate rounded bg-black/45 px-1 text-[10px] font-medium text-white">
              {player ? shortName(player.name) : "Add"}
            </span>
            {player && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onClearSlot(s.id);
                }}
                className="mt-0.5 cursor-pointer text-[9px] text-white/80 underline"
              >
                remove
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function PlayerPicker({
  slotLabel,
  role,
  players,
  usedIds,
  currentId,
  onPick,
  onClose,
}: {
  slotLabel: string;
  role: SlotRole;
  players: SquadPlayer[];
  usedIds: Set<number>;
  currentId: number | null;
  onPick: (p: SquadPlayer) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = players.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div>
            <h3 className="font-bold text-brand-dark">Pick for {slotLabel}</h3>
            <p className="text-xs text-slate-500">Best {role} fits shown first</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full px-2 py-1 text-slate-400 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        <div className="p-3">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        <ul className="flex-1 overflow-y-auto px-3 pb-4">
          {filtered.length === 0 && (
            <li className="py-8 text-center text-sm text-slate-500">
              No players match “{query}”.
            </li>
          )}
          {filtered.map((p) => {
            const used = usedIds.has(p.id) && p.id !== currentId;
            const goodFit = p.position === role;
            return (
              <li key={p.id}>
                <button
                  onClick={() => onPick(p)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                    p.id === currentId ? "bg-blue-50" : ""
                  }`}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                    {p.shirtNumber ?? "–"}
                  </span>
                  <span className="flex-1">
                    <span className="font-medium text-slate-800">{p.name}</span>
                    {used && (
                      <span className="ml-2 text-xs text-amber-600">
                        (already in XI — moves them here)
                      </span>
                    )}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      goodFit ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {p.position}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
