"use client";

import { useMemo, useState, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveLegend, type ActionResult } from "./actions";

export type Legend = {
  id: number;
  name: string;
  seasons: string[];
  slots: string[];
  price_m: number | null;
  attack: number | null;
  defence: number | null;
  excluded: boolean;
  note: string | null;
};

const initial: ActionResult = { ok: true, message: "" };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

function LegendRow({ p }: { p: Legend }) {
  const [state, formAction] = useActionState(saveLegend, initial);
  const isPlaceholder = !!p.note;

  return (
    <form
      action={formAction}
      className={`grid grid-cols-[1fr_auto] items-start gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_repeat(3,5rem)_auto_auto] sm:items-center ${
        isPlaceholder ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
      }`}
    >
      <input type="hidden" name="id" value={p.id} />

      {/* Name + facts */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-slate-800">{p.name}</span>
          {isPlaceholder && (
            <span className="shrink-0 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
              PLACEHOLDER
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500">
          {p.slots.join("/") || "—"} · {p.seasons.length} season
          {p.seasons.length === 1 ? "" : "s"}
        </div>
      </div>

      {/* Price */}
      <label className="flex flex-col text-[10px] font-medium text-slate-500">
        <span className="sm:hidden">Price £m</span>
        <input
          name="price_m"
          type="number"
          min={0}
          step={1}
          defaultValue={p.price_m ?? ""}
          className="w-20 rounded border border-slate-300 px-2 py-1 text-sm text-slate-800 focus:border-brand focus:outline-none sm:w-full"
        />
      </label>

      {/* Attack */}
      <label className="flex flex-col text-[10px] font-medium text-slate-500">
        <span className="sm:hidden">Attack</span>
        <input
          name="attack"
          type="number"
          min={0}
          max={100}
          step={1}
          defaultValue={p.attack ?? ""}
          className="w-20 rounded border border-slate-300 px-2 py-1 text-sm text-slate-800 focus:border-brand focus:outline-none sm:w-full"
        />
      </label>

      {/* Defence */}
      <label className="flex flex-col text-[10px] font-medium text-slate-500">
        <span className="sm:hidden">Defence</span>
        <input
          name="defence"
          type="number"
          min={0}
          max={100}
          step={1}
          defaultValue={p.defence ?? ""}
          className="w-20 rounded border border-slate-300 px-2 py-1 text-sm text-slate-800 focus:border-brand focus:outline-none sm:w-full"
        />
      </label>

      {/* Exclude */}
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <input
          name="excluded"
          type="checkbox"
          defaultChecked={p.excluded}
          className="h-4 w-4 rounded border-slate-300"
        />
        Hide
      </label>

      {/* Save + status */}
      <div className="flex items-center gap-2">
        <SaveButton />
        {state.message && (
          <span
            className={`text-xs ${state.ok ? "text-green-700" : "text-red-700"}`}
          >
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

export default function LegendsAdmin({ legends }: { legends: Legend[] }) {
  const [search, setSearch] = useState("");
  const [slot, setSlot] = useState("ALL");
  const [placeholderOnly, setPlaceholderOnly] = useState(false);

  const slots = useMemo(() => {
    const s = new Set<string>();
    for (const p of legends) for (const x of p.slots) s.add(x);
    return ["ALL", ...[...s].sort()];
  }, [legends]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return legends.filter((p) => {
      if (placeholderOnly && !p.note) return false;
      if (slot !== "ALL" && !p.slots.includes(slot)) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [legends, search, slot, placeholderOnly]);

  const placeholderCount = legends.filter((p) => p.note).length;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name…"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        <select
          value={slot}
          onChange={(e) => setSlot(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        >
          {slots.map((s) => (
            <option key={s} value={s}>
              {s === "ALL" ? "All positions" : s}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={placeholderOnly}
            onChange={(e) => setPlaceholderOnly(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Needs review ({placeholderCount})
        </label>
      </div>

      <p className="text-xs text-slate-500">
        Showing {filtered.length} of {legends.length} players. Attack &amp;
        defence are 0–100; price is in £m. Saving a player clears its
        PLACEHOLDER flag (marks it reviewed).
      </p>

      {/* Column headers (desktop) */}
      <div className="hidden px-3 text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:grid sm:grid-cols-[minmax(0,1fr)_repeat(3,5rem)_auto_auto] sm:gap-3">
        <span>Player</span>
        <span>Price £m</span>
        <span>Attack</span>
        <span>Defence</span>
        <span>Hide</span>
        <span></span>
      </div>

      <div className="space-y-2">
        {filtered.map((p) => (
          <LegendRow key={p.id} p={p} />
        ))}
        {filtered.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No players match your filters.
          </p>
        )}
      </div>
    </div>
  );
}
