import Link from "next/link";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import {
  weeklyDraws,
  currentWeekKey,
  weekLabel,
  nextWeeklyResetIso,
  POINTS_TO_BEAT,
  STARTING_BANKROLL,
  type Player,
} from "@/lib/game95";
import WeeklyGame from "./WeeklyGame";
import WeeklyLeaderboard, { type WeeklyRow } from "./WeeklyLeaderboard";
import Countdown from "./Countdown";

export const metadata = {
  title: "This week's 95-Point Game — The Blues Collective",
};
export const dynamic = "force-dynamic";

async function loadRoster(): Promise<Player[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("blues_legends")
    .select("id, name, seasons, slots, price_m, attack, defence")
    .eq("excluded", false)
    .not("price_m", "is", null);

  if (data && data.length > 0) {
    return data
      .filter((p) => p.price_m != null)
      .map((p) => ({
        id: p.id,
        name: p.name,
        seasons: Array.isArray(p.seasons) ? (p.seasons as string[]) : [],
        slots: Array.isArray(p.slots) ? (p.slots as string[]) : [],
        priceM: Number(p.price_m),
        attack: p.attack ?? 0,
        defence: p.defence ?? 0,
      }));
  }
  try {
    const file = path.join(process.cwd(), "data", "blues-legends.json");
    const json = JSON.parse(readFileSync(file, "utf8"));
    return (json.players ?? [])
      .filter((p: { excluded?: boolean; priceM?: number | null }) => !p.excluded && p.priceM != null)
      .map(
        (
          p: { name: string; seasons?: string[]; slots?: string[]; priceM: number; attack?: number; defence?: number },
          i: number
        ) => ({
          id: i + 1,
          name: p.name,
          seasons: p.seasons ?? [],
          slots: p.slots ?? [],
          priceM: p.priceM,
          attack: p.attack ?? 0,
          defence: p.defence ?? 0,
        })
      );
  } catch {
    return [];
  }
}

function seasonsFromRoster(players: Player[]): string[] {
  const set = new Set<string>();
  for (const p of players) for (const s of p.seasons) set.add(s);
  return [...set].sort();
}

export default async function WeeklyPage() {
  const [players, user] = await Promise.all([loadRoster(), getCurrentUser()]);
  const supabase = await createClient();

  if (players.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-800">Weekly challenge</h1>
        <p className="mt-3 text-slate-600">
          The roster hasn&apos;t been loaded yet.
        </p>
      </main>
    );
  }

  const weekKey = currentWeekKey();
  const seasons = seasonsFromRoster(players);
  const draws = weeklyDraws(players, seasons, weekKey);
  const resetIso = nextWeeklyResetIso();
  const label = weekLabel(weekKey);

  // Has this user already logged a scored attempt this week?
  let myResult: {
    projected_points: number;
    spent: number;
    best_points: number | null;
  } | null = null;
  if (user) {
    const { data } = await supabase
      .from("game_results")
      .select("projected_points, spent, best_points")
      .eq("owner", user.id)
      .eq("week_key", weekKey)
      .maybeSingle();
    myResult = data ?? null;
  }

  // Leaderboard for this week.
  const { data: results } = await supabase
    .from("game_results")
    .select("owner, projected_points, spent")
    .eq("week_key", weekKey)
    .eq("is_practice", false)
    .order("projected_points", { ascending: false })
    .limit(50);

  const ownerIds = [...new Set((results ?? []).map((r) => r.owner))];
  const nameById = new Map<string, string>();
  if (ownerIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, username")
      .in("id", ownerIds);
    for (const p of profs ?? []) nameById.set(p.id, p.username);
  }
  const rows: WeeklyRow[] = (results ?? []).map((r) => ({
    userId: r.owner,
    username: nameById.get(r.owner) ?? "fan",
    points: r.projected_points,
    spent: r.spent,
  }));

  return (
    <div className="min-h-full bg-brand-dark">
      <main className="mx-auto max-w-3xl px-4 py-6 text-white">
        <header className="text-center">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            <span className="text-amber-400">Weekly</span> 95-Point Challenge
          </h1>
          <p className="mt-1 text-sm text-slate-300">{label}</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-300">
            Everyone gets the same six seasons this week. Build your best spine
            on £{STARTING_BANKROLL}m and beat {POINTS_TO_BEAT}. One scored
            attempt per week.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Next challenge in <Countdown targetIso={resetIso} /> ·{" "}
            <Link
              href="/95-point-game"
              className="text-amber-300 underline hover:text-amber-200"
            >
              free practice mode →
            </Link>
          </p>
        </header>

        {myResult ? (
          <section className="mt-5 rounded-2xl bg-white/10 p-5 text-center">
            <div className="text-[11px] font-bold uppercase tracking-widest text-amber-300">
              You&apos;ve played this week
            </div>
            <div className="text-5xl font-black text-amber-400">
              {myResult.projected_points}
            </div>
            <p className="mt-1 text-sm text-slate-300">
              projected points · £{myResult.spent}m spent
              {myResult.best_points != null && (
                <> · best possible was {myResult.best_points}</>
              )}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Come back after the reset for a fresh set of seasons. Meanwhile,
              try{" "}
              <Link
                href="/95-point-game"
                className="text-amber-300 underline hover:text-amber-200"
              >
                practice mode
              </Link>
              .
            </p>
          </section>
        ) : (
          <div className="mt-5">
            <WeeklyGame
              players={players}
              draws={draws}
              weekText={label}
              canPost={!!user}
            />
          </div>
        )}

        {/* Leaderboard */}
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-amber-300">
            This week&apos;s leaderboard
          </h2>
          <WeeklyLeaderboard rows={rows} meId={user?.id ?? null} />
        </section>

        {/* Disclaimer + credit */}
        <footer className="mt-8 space-y-2 border-t border-white/10 pt-4 text-center text-[11px] text-slate-400">
          <p>
            Unofficial fan project. Not affiliated with Chelsea FC. Player prices
            and ratings are invented for game balance and are not real
            valuations.
          </p>
          <p>Game concept inspired by HoopsMatic&apos;s 73-9 Game.</p>
        </footer>
      </main>
    </div>
  );
}
