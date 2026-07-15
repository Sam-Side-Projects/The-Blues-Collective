export type LeaderboardRow = {
  userId: string;
  username: string;
  totalPoints: number;
  played: number;
  bestPoints: number;
};

/**
 * Season prediction-league table: total points across all scored fixtures.
 */
export default function Leaderboard({
  rows,
  meId,
}: {
  rows: LeaderboardRow[];
  meId: string | null;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
        No scores yet — once a match is played and predictions are scored, the
        table will fill up here.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-semibold">#</th>
            <th className="px-3 py-2 font-semibold">Fan</th>
            <th className="px-3 py-2 text-right font-semibold">Played</th>
            <th className="px-3 py-2 text-right font-semibold">Best</th>
            <th className="px-3 py-2 text-right font-semibold">Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isMe = meId === r.userId;
            return (
              <tr
                key={r.userId}
                className={`border-b border-slate-100 last:border-0 ${
                  isMe ? "bg-blue-50" : ""
                }`}
              >
                <td className="px-3 py-2 font-semibold text-slate-500">{i + 1}</td>
                <td className="px-3 py-2 font-medium text-slate-800">
                  @{r.username}
                  {isMe && (
                    <span className="ml-1.5 rounded bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                      YOU
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-slate-500">{r.played}</td>
                <td className="px-3 py-2 text-right text-slate-500">{r.bestPoints}</td>
                <td className="px-3 py-2 text-right font-bold text-brand-dark">
                  {r.totalPoints}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
