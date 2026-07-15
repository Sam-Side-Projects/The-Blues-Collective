import MiniPitch from "@/components/MiniPitch";
import type { Consensus } from "@/lib/predictions";

/**
 * Shows the community's collective predicted XI for a fixture — the most-picked
 * player for each position — with how many fans agreed on each.
 */
export default function ConsensusXI({ consensus }: { consensus: Consensus }) {
  const named = consensus.slots.filter((s) => s.playerName);
  const topPicks = [...named].sort((a, b) => b.pickPct - a.pickPct).slice(0, 6);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold text-brand-dark">Consensus XI</h2>
        <span className="text-xs text-slate-500">
          from {consensus.totalPredictions}{" "}
          {consensus.totalPredictions === 1 ? "prediction" : "predictions"}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <div className="mx-auto w-full max-w-[200px]">
          <MiniPitch
            formation={consensus.formation}
            slots={consensus.slots}
            title={`Consensus · ${consensus.formation}`}
          />
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Most agreed picks
          </p>
          <ul className="space-y-1.5">
            {topPicks.map((s) => (
              <li key={s.slotId} className="flex items-center gap-2 text-sm">
                <span className="w-10 shrink-0 text-xs font-semibold text-slate-400">
                  {s.role}
                </span>
                <span className="flex-1 truncate text-slate-700">{s.playerName}</span>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                    <span
                      className="block h-full bg-brand"
                      style={{ width: `${s.pickPct}%` }}
                    />
                  </span>
                  <span className="w-9 text-right text-xs font-semibold text-slate-500">
                    {s.pickPct}%
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
