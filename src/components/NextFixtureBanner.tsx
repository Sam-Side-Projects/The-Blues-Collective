import { createClient } from "@/lib/supabase/server";

/**
 * Shows the next upcoming Chelsea fixture, read only from our own DB.
 * If no fixture is scheduled it says so plainly — it NEVER invents one.
 */
export default async function NextFixtureBanner() {
  let next: {
    home_team: string;
    away_team: string;
    opponent: string | null;
    chelsea_home: boolean | null;
    kickoff: string;
  } | null = null;

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("fixtures")
      .select("home_team, away_team, opponent, chelsea_home, kickoff")
      .gte("kickoff", new Date().toISOString())
      .order("kickoff", { ascending: true })
      .limit(1)
      .maybeSingle();
    next = data;
  } catch {
    next = null;
  }

  if (!next) {
    return (
      <div className="bg-brand text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
          <span className="font-semibold uppercase tracking-wide text-blue-100">
            Next up
          </span>
          <span className="text-blue-100">No fixture scheduled</span>
        </div>
      </div>
    );
  }

  const kickoff = new Date(next.kickoff);
  const when = kickoff.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="bg-brand text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
        <span className="font-semibold uppercase tracking-wide text-blue-100">
          Next up
        </span>
        <span className="font-bold">
          {next.home_team} v {next.away_team}
        </span>
        <span className="text-blue-100">·</span>
        <span className="text-blue-100">{when}</span>
      </div>
    </div>
  );
}
