import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import LegendsAdmin, { type Legend } from "./LegendsAdmin";

export const metadata = { title: "Admin · Legends — The Blues Collective" };
export const dynamic = "force-dynamic";

export default async function LegendsAdminPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-800">Legends admin</h1>
        <p className="mt-3 text-slate-600">
          Please{" "}
          <Link href="/login" className="text-brand underline">
            log in
          </Link>{" "}
          as an admin to edit the roster.
        </p>
      </main>
    );
  }

  if (!user.isAdmin) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-800">Legends admin</h1>
        <p className="mt-3 text-slate-600">
          This page is for admins only.
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("blues_legends")
    .select("id, name, seasons, slots, price_m, attack, defence, excluded, note")
    .order("name", { ascending: true });

  const legends: Legend[] = (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    seasons: Array.isArray(p.seasons) ? (p.seasons as string[]) : [],
    slots: Array.isArray(p.slots) ? (p.slots as string[]) : [],
    price_m: p.price_m,
    attack: p.attack,
    defence: p.defence,
    excluded: p.excluded,
    note: p.note,
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-800">
        95-Point Game · Roster editor
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Tune each player&apos;s price and ratings for game balance. The player
        facts (name, seasons, positions) come from Wikidata and can&apos;t be
        edited here. Prices and ratings are your invented balance values, not
        real valuations.
      </p>

      {legends.length === 0 ? (
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">The roster table is empty.</p>
          <p className="mt-1">
            Run{" "}
            <code className="rounded bg-amber-100 px-1">
              node scripts/seed-blues-legends.mjs
            </code>{" "}
            once (after running the updated schema in Supabase) to load the
            players, then refresh this page.
          </p>
        </div>
      ) : (
        <div className="mt-6">
          <LegendsAdmin legends={legends} />
        </div>
      )}
    </main>
  );
}
