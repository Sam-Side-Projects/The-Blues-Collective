"use client";

import { useState, useTransition } from "react";
import { scoreFixtureNow } from "./actions";

/**
 * Admin-only helper to score a fixture on demand (instead of waiting for the
 * matchday cron). Handy for testing the scoring pipeline.
 */
export default function AdminScoreButton({ fixtureId }: { fixtureId: number }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState("");

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() =>
          startTransition(async () => {
            const res = await scoreFixtureNow(fixtureId);
            setMsg(res.message);
          })
        }
        disabled={pending}
        className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
      >
        {pending ? "Scoring…" : "Admin: score this fixture now"}
      </button>
      {msg && <span className="text-xs text-amber-800">{msg}</span>}
    </div>
  );
}
