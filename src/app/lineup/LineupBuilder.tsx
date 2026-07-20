"use client";

import { useMemo, useState } from "react";
import {
  FORMATIONS,
  FORMATION_NAMES,
  type FormationName,
  type SlotRole,
} from "@/lib/formations";
import { saveLineup, type SavedSlot } from "./actions";
import { exportLineupPng } from "@/lib/exportLineup";

export type SquadPlayer = {
  id: number;
  name: string;
  position: string; // GK/DEF/MID/FWD
  shirtNumber: number | null;
  value: number | null;
};

export type FixtureOption = { id: number; label: string };

type Assignments = Record<string, SquadPlayer | null>;

// How well a player's position matches a slot role, for sorting suggestions.
function fitScore(playerPos: string, role: SlotRole): number {
  if (playerPos === role) return 0; // perfect
  const adjacency: Record<SlotRole, string[]> = {
    GK: [],
    DEF: ["MID"],
    MID: ["DEF", "FWD"],
    FWD: ["MID"],
  };
  if (adjacency[role]?.includes(playerPos)) return 1; // adjacent
  return 2; // poor fit
}

export default function LineupBuilder({
  squad,
  fixtures,
  isLoggedIn,
}: {
  squad: SquadPlayer[];
  fixtures: FixtureOption[];
  isLoggedIn: boolean;
}) {
  const [formation, setFormation] = useState<FormationName>("4-3-3");
  const [assignments, setAssignments] = useState<Assignments>({});
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [fixtureId, setFixtureId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  // Id of the most recently saved lineup, so we can link to its share page.
  const [savedId, setSavedId] = useState<string | null>(null);

  const slots = FORMATIONS[formation];
  const activeSlotDef = slots.find((s) => s.id === activeSlot) ?? null;

  // Players already used, so we can't pick the same player twice.
  const usedIds = useMemo(
    () =>
      new Set(
        Object.values(assignments)
          .filter((p): p is SquadPlayer => !!p)
          .map((p) => p.id)
      ),
    [assignments]
  );

  // Sorted player list for the picker: best positional fit first, then value.
  const pickerList = useMemo(() => {
    if (!activeSlotDef) return [];
    return [...squad]
      .sort((a, b) => {
        const fa = fitScore(a.position, activeSlotDef.role);
        const fb = fitScore(b.position, activeSlotDef.role);
        if (fa !== fb) return fa - fb;
        return (b.value ?? 0) - (a.value ?? 0);
      });
  }, [squad, activeSlotDef]);

  function changeFormation(next: FormationName) {
    setFormation(next);
    setAssignments({}); // slots differ between formations; start fresh
    setActiveSlot(null);
    setMessage(null);
  }

  function pickPlayer(player: SquadPlayer) {
    if (!activeSlot) return;
    setAssignments((prev) => {
      const next = { ...prev };
      // Remove this player from any other slot first.
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

  const filledCount = Object.values(assignments).filter(Boolean).length;

  function buildSavedSlots(): SavedSlot[] {
    return slots.map((s) => {
      const p = assignments[s.id] ?? null;
      return {
        slotId: s.id,
        role: s.role,
        playerId: p?.id ?? null,
        playerName: p?.name ?? null,
      };
    });
  }

  async function handleDownload() {
    setMessage(null);
    try {
      await exportLineupPng({
        formation,
        title: title || "My XI",
        slots: slots.map((s) => ({
          ...s,
          playerName: assignments[s.id]?.name ?? null,
          shirtNumber: assignments[s.id]?.shirtNumber ?? null,
        })),
      });
    } catch {
      setMessage({
        ok: false,
        text: "Sorry, the image download failed. Please try again.",
      });
    }
  }

  async function handleSave(postToFeed: boolean) {
    setBusy(true);
    setMessage(null);
    const res = await saveLineup({
      title,
      formation,
      slots: buildSavedSlots(),
      fixtureId,
      postToFeed,
    });
    setMessage({ ok: res.ok, text: res.message });
    // Keep the id so we can offer a shareable link to the saved lineup.
    setSavedId(res.ok ? (res.lineupId ?? null) : null);
    setBusy(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* ---------- Left: controls + pitch ---------- */}
      <div>
        {/* Formation selector */}
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
          <span className="ml-auto text-sm text-slate-500">
            {filledCount}/11 picked
          </span>
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

      {/* ---------- Right: details + actions ---------- */}
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <label className="block text-sm font-medium text-slate-700">
            Lineup name
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. My matchday XI"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />

          {fixtures.length > 0 && (
            <div className="mt-3">
              <label className="block text-sm font-medium text-slate-700">
                For which fixture? (optional)
              </label>
              <select
                value={fixtureId ?? ""}
                onChange={(e) =>
                  setFixtureId(e.target.value ? Number(e.target.value) : null)
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              >
                <option value="">No fixture</option>
                {fixtures.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Saving against an upcoming fixture will count as your prediction
                (Phase 5).
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <button
            onClick={handleDownload}
            className="w-full rounded-lg border border-brand bg-white px-4 py-2 text-sm font-semibold text-brand hover:bg-blue-50"
          >
            Download as image (PNG)
          </button>

          <button
            onClick={() => handleSave(false)}
            disabled={busy || !isLoggedIn}
            className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save lineup"}
          </button>

          <button
            onClick={() => handleSave(true)}
            disabled={busy || !isLoggedIn}
            className="w-full rounded-lg bg-brand-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand disabled:opacity-50"
          >
            {busy ? "Posting…" : "Save & post to The Shed"}
          </button>

          {!isLoggedIn && (
            <p className="text-center text-xs text-slate-500">
              Log in to save or post. Downloading works without an account.
            </p>
          )}
        </div>

        {message && (
          <div
            className={`rounded-lg px-3 py-2 text-sm ${
              message.ok
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            <p>{message.text}</p>
            {savedId && (
              <a
                href={`/lineup/${savedId}`}
                className="mt-1 inline-block font-semibold underline"
              >
                View &amp; share your XI →
              </a>
            )}
          </div>
        )}
      </div>

      {/* ---------- Player picker modal ---------- */}
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

/* ============================ Pitch ============================ */
function Pitch({
  slots,
  assignments,
  onSlotClick,
  onClearSlot,
}: {
  slots: typeof FORMATIONS[FormationName];
  assignments: Assignments;
  onSlotClick: (id: string) => void;
  onClearSlot: (id: string) => void;
}) {
  return (
    <div
      className="relative mx-auto w-full max-w-md overflow-hidden rounded-xl border-2 border-white shadow-md"
      style={{
        aspectRatio: "68 / 105",
        background:
          "linear-gradient(180deg, #1a7d3a 0%, #1f8f43 50%, #1a7d3a 100%)",
      }}
    >
      {/* Simple pitch markings */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-2 rounded border border-white/40" />
        <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40" />
        <div className="absolute left-1/2 top-2 h-1 w-1 -translate-x-1/2 rounded-full bg-white/40" />
      </div>

      {slots.map((s) => {
        const player = assignments[s.id];
        // Flip y so y=100 (attack) renders near the top of the pitch image.
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

/* ========================= Player Picker ========================= */
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
            <p className="text-xs text-slate-500">
              Best {role} fits shown first · values are community estimates
            </p>
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
                      goodFit
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {p.position}
                  </span>
                  <span className="w-14 text-right text-xs text-slate-500">
                    {p.value != null ? `€${p.value}m` : "—"}
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

function shortName(name: string): string {
  const parts = name.split(" ");
  if (parts.length === 1) return parts[0];
  return parts[parts.length - 1];
}
