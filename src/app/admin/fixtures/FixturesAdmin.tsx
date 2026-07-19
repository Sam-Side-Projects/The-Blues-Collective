"use client";

import { useState, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { addFixture, deleteFixture, type ActionResult } from "./actions";

export type ManualFixture = {
  id: number;
  home_team: string;
  away_team: string;
  competition: string | null;
  kickoff: string;
};

const initial: ActionResult = { ok: true, message: "" };

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
    >
      {pending ? "Adding…" : "Add fixture"}
    </button>
  );
}

function DeleteButton({ id }: { id: number }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        if (!confirm("Remove this fixture?")) return;
        setPending(true);
        await deleteFixture(id);
        setPending(false);
      }}
      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
    >
      {pending ? "…" : "Remove"}
    </button>
  );
}

export default function FixturesAdmin({
  fixtures,
}: {
  fixtures: ManualFixture[];
}) {
  const [state, formAction] = useActionState(addFixture, initial);

  return (
    <div className="space-y-6">
      {/* Add form */}
      <form
        action={formAction}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Opponent
            <input
              name="opponent"
              type="text"
              placeholder="e.g. Bayern Munich"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Competition
            <input
              name="competition"
              type="text"
              defaultValue="Pre-season friendly"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Date
            <input
              name="date"
              type="date"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Kick-off time
            <input
              name="time"
              type="time"
              defaultValue="15:00"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Home or away
            <select
              name="venue"
              defaultValue="home"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand focus:outline-none"
            >
              <option value="home">Chelsea at home</option>
              <option value="away">Chelsea away</option>
            </select>
          </label>
        </div>

        <div className="flex items-center gap-3">
          <AddButton />
          {state.message && (
            <span
              className={`text-sm ${
                state.ok ? "text-green-700" : "text-red-700"
              }`}
            >
              {state.message}
            </span>
          )}
        </div>
      </form>

      {/* Existing manual fixtures */}
      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          Fixtures you&apos;ve added
        </h2>
        {fixtures.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            You haven&apos;t added any fixtures by hand yet. Real Premier League
            fixtures load automatically — this page is for friendlies and other
            games the feed doesn&apos;t cover.
          </p>
        ) : (
          <ul className="space-y-2">
            {fixtures.map((f) => {
              const when = new Date(f.kickoff).toLocaleString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800">
                      {f.home_team} v {f.away_team}
                    </div>
                    <div className="text-xs text-slate-500">
                      {f.competition ?? "Friendly"} · {when}
                    </div>
                  </div>
                  <DeleteButton id={f.id} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
