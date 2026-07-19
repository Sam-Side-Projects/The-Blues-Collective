export type WeeklyRow = {
  userId: string;
  username: string;
  points: number;
  spent: number;
};

/** This week's 95-Point Game leaderboard, highest projected points first. */
export default function WeeklyLeaderboard({
  rows,
  meId,
}: {
  rows: WeeklyRow[];
  meId: string | null;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/20 bg-white/5 px-4 py-8 text-center text-sm text-slate-400">
        No scores yet this week — be the first to log a team.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/5 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2 font-semibold">#</th>
            <th className="px-3 py-2 font-semibold">Fan</th>
            <th className="px-3 py-2 text-right font-semibold">Spent</th>
            <th className="px-3 py-2 text-right font-semibold">Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isMe = meId === r.userId;
            return (
              <tr
                key={r.userId}
                className={`border-b border-white/5 last:border-0 ${
                  isMe ? "bg-amber-400/10" : ""
                }`}
              >
                <td className="px-3 py-2 font-semibold text-slate-400">{i + 1}</td>
                <td className="px-3 py-2 font-medium text-white">
                  @{r.username}
                  {isMe && (
                    <span className="ml-1.5 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-brand-dark">
                      YOU
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-slate-400">£{r.spent}m</td>
                <td className="px-3 py-2 text-right font-bold text-amber-300">
                  {r.points}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
