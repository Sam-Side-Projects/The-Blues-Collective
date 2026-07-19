import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import type { Player } from "@/lib/game95";
import Game from "./Game";

export const metadata = { title: "The 95-Point Game — The Blues Collective" };
export const dynamic = "force-dynamic";

/**
 * Load the roster from the database (the live, founder-edited source of truth).
 * If the table is empty or unreachable, fall back to the seed JSON so the game
 * still works. Either way, NO external API is called during gameplay.
 */
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

  // Fallback: read the seed JSON bundled with the repo.
  try {
    const file = path.join(process.cwd(), "data", "blues-legends.json");
    const json = JSON.parse(readFileSync(file, "utf8"));
    return (json.players ?? [])
      .filter(
        (p: { excluded?: boolean; priceM?: number | null }) =>
          !p.excluded && p.priceM != null
      )
      .map(
        (
          p: {
            name: string;
            seasons?: string[];
            slots?: string[];
            priceM: number;
            attack?: number;
            defence?: number;
          },
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

export default async function NinetyFivePointGamePage() {
  const [players, user] = await Promise.all([loadRoster(), getCurrentUser()]);
  const seasons = seasonsFromRoster(players);

  if (players.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-800">The 95-Point Game</h1>
        <p className="mt-3 text-slate-600">
          The player roster hasn&apos;t been loaded yet. An admin needs to run
          the seed step first.
        </p>
      </main>
    );
  }

  return <Game players={players} seasons={seasons} canPost={!!user} />;
}
