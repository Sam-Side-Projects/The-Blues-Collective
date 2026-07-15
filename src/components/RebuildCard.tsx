"use client";

import { useState, useTransition } from "react";
import { timeAgo } from "@/lib/timeAgo";
import { toggleRebuildVote, deleteRebuild } from "@/app/transfers/actions";

type MovePlayer = { name: string; position: string; club: string; value: number };
export type RebuildMovesData = {
  sold: MovePlayer[];
  loaned_out: MovePlayer[];
  bought: MovePlayer[];
  loaned_in: MovePlayer[];
};

export type RebuildCardData = {
  id: string;
  ownerId: string;
  ownerName: string;
  title: string;
  moves: RebuildMovesData;
  spend: number;
  raised: number;
  net: number;
  note: string | null;
  createdAt: string;
  isDemo: boolean;
  voteCount: number;
  votedByMe: boolean;
};

export default function RebuildCard({
  rebuild,
  viewer,
  isWeeklyTop = false,
}: {
  rebuild: RebuildCardData;
  viewer: { id: string; isAdmin: boolean } | null;
  isWeeklyTop?: boolean;
}) {
  const [votes, setVotes] = useState(rebuild.voteCount);
  const [mine, setMine] = useState(rebuild.votedByMe);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const canModerate = viewer && (viewer.id === rebuild.ownerId || viewer.isAdmin);

  function vote() {
    if (!viewer) {
      setNotice("Log in to vote.");
      return;
    }
    setMine((m) => !m);
    setVotes((v) => v + (mine ? -1 : 1));
    startTransition(() => {
      void toggleRebuildVote(rebuild.id);
    });
  }

  return (
    <article
      className={`rounded-xl border bg-white p-4 shadow-sm ${
        isWeeklyTop ? "border-amber-400 ring-1 ring-amber-300" : "border-slate-200"
      }`}
    >
      {isWeeklyTop && (
        <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
          ⭐ Top rebuild this week
        </div>
      )}

      <header className="flex items-center gap-2">
        <div className="flex-1">
          <h3 className="font-bold text-brand-dark">{rebuild.title}</h3>
          <p className="text-xs text-slate-500">
            @{rebuild.ownerName}
            {rebuild.isDemo && (
              <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-500">
                demo
              </span>
            )}{" "}
            · {timeAgo(rebuild.createdAt)}
          </p>
        </div>
        <button
          onClick={vote}
          disabled={pending}
          className={`flex flex-col items-center rounded-lg border px-3 py-1 text-sm font-bold ${
            mine
              ? "border-brand bg-brand text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          ▲<span className="text-xs">{votes}</span>
        </button>
      </header>

      <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2 text-center text-xs">
        <div>
          <div className="font-bold text-slate-800">€{rebuild.spend}m</div>
          <div className="text-slate-500">Spend</div>
        </div>
        <div>
          <div className="font-bold text-slate-800">€{rebuild.raised}m</div>
          <div className="text-slate-500">Raised</div>
        </div>
        <div>
          <div className="font-bold text-slate-800">€{rebuild.net}m</div>
          <div className="text-slate-500">Net</div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <MoveList title="In" tone="in" players={[...rebuild.moves.bought, ...rebuild.moves.loaned_in]} loans={rebuild.moves.loaned_in} />
        <MoveList title="Out" tone="out" players={[...rebuild.moves.sold, ...rebuild.moves.loaned_out]} loans={rebuild.moves.loaned_out} />
      </div>

      {rebuild.note && (
        <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          “{rebuild.note}”
        </p>
      )}

      {canModerate && (
        <div className="mt-3 text-right">
          <button
            onClick={() => {
              if (confirm("Delete this rebuild?")) {
                startTransition(async () => {
                  const r = await deleteRebuild(rebuild.id);
                  setNotice(r.message);
                });
              }
            }}
            disabled={pending}
            className="text-xs text-red-500 hover:text-red-700"
          >
            Delete
          </button>
        </div>
      )}
      {notice && <p className="mt-1 text-xs text-slate-500">{notice}</p>}
    </article>
  );
}

function MoveList({
  title,
  tone,
  players,
  loans,
}: {
  title: string;
  tone: "in" | "out";
  players: MovePlayer[];
  loans: MovePlayer[];
}) {
  const loanNames = new Set(loans.map((l) => l.name));
  return (
    <div>
      <div
        className={`mb-1 text-xs font-bold ${
          tone === "in" ? "text-green-700" : "text-red-600"
        }`}
      >
        {tone === "in" ? "▼ In" : "▲ Out"} ({players.length})
      </div>
      {players.length === 0 ? (
        <p className="text-xs text-slate-400">None</p>
      ) : (
        <ul className="space-y-0.5">
          {players.map((p) => (
            <li key={p.name} className="flex items-center gap-1 text-xs text-slate-700">
              <span className="w-8 shrink-0 text-slate-400">{p.position}</span>
              <span className="flex-1 truncate">{p.name}</span>
              {loanNames.has(p.name) && (
                <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">
                  loan
                </span>
              )}
              <span className="text-slate-400">€{p.value}m</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
