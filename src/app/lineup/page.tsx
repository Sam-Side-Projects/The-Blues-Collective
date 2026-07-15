import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import LineupBuilder, { type SquadPlayer, type FixtureOption } from "./LineupBuilder";

export const metadata = { title: "Lineup Builder — The Blues Collective" };

export default async function LineupPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data: squadData } = await supabase
    .from("squad_players")
    .select("id, name, position, shirt_number, market_value")
    .eq("is_active", true)
    .order("position", { ascending: true })
    .order("shirt_number", { ascending: true });

  const { data: fixtureData } = await supabase
    .from("fixtures")
    .select("id, home_team, away_team, kickoff")
    .gte("kickoff", new Date().toISOString())
    .order("kickoff", { ascending: true })
    .limit(5);

  const squad: SquadPlayer[] = (squadData ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    position: p.position,
    shirtNumber: p.shirt_number,
    value: p.market_value,
  }));

  const fixtures: FixtureOption[] = (fixtureData ?? []).map((f) => ({
    id: f.id,
    label: `${f.home_team} v ${f.away_team}`,
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-dark">Lineup Builder</h1>
        <p className="mt-1 text-sm text-slate-600">
          Pick a formation, tap a spot on the pitch, and choose your player.
          Download it as an image or post it to The Shed.
        </p>
      </div>

      {!user && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You can build and download a lineup without an account. To{" "}
          <strong>save</strong> it or <strong>post</strong> it, please{" "}
          <Link href="/login" className="font-semibold underline">
            log in
          </Link>{" "}
          or{" "}
          <Link href="/signup" className="font-semibold underline">
            sign up
          </Link>
          .
        </div>
      )}

      {squad.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-slate-500">
          The squad list is empty. Once the database seed has run, players will
          appear here.
        </div>
      ) : (
        <LineupBuilder
          squad={squad}
          fixtures={fixtures}
          isLoggedIn={!!user}
        />
      )}
    </div>
  );
}
