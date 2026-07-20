import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/timeAgo";
import { absoluteUrl } from "@/lib/siteUrl";
import MiniPitch from "@/components/MiniPitch";
import ShareButtons from "@/components/ShareButtons";

export const dynamic = "force-dynamic";

type SavedSlot = {
  slotId: string;
  role: string;
  playerId: number | null;
  playerName: string | null;
};

type LineupRow = {
  id: string;
  title: string | null;
  formation: string;
  slots: SavedSlot[];
  created_at: string;
  owner_profile: { username: string } | null;
};

async function loadLineup(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lineups")
    .select(
      `id, title, formation, slots, created_at,
       owner_profile:profiles!lineups_owner_fkey(username)`
    )
    .eq("id", id)
    .maybeSingle<LineupRow>();
  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lineup = await loadLineup(id);
  if (!lineup) return { title: "Lineup — The Blues Collective" };

  const who = lineup.owner_profile?.username ?? "a fan";
  const title = `${lineup.title || "My XI"} (${lineup.formation})`;
  return {
    title: `${title} — The Blues Collective`,
    description: `${who}'s Chelsea XI in a ${lineup.formation}. Build your own on The Blues Collective.`,
    openGraph: {
      title,
      description: `${who}'s Chelsea XI in a ${lineup.formation}.`,
      url: absoluteUrl(`/lineup/${id}`),
      type: "article",
    },
    twitter: { card: "summary_large_image", title },
  };
}

export default async function SharedLineupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lineup = await loadLineup(id);
  if (!lineup) notFound();

  const slots = Array.isArray(lineup.slots) ? lineup.slots : [];
  const named = slots.filter((s) => s.playerName);
  const who = lineup.owner_profile?.username ?? "fan";
  const title = lineup.title || "My XI";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/lineup" className="text-sm text-brand hover:underline">
        ← Build your own XI
      </Link>

      <article className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <header className="mb-4">
          <h1 className="text-2xl font-extrabold text-brand-dark">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            @{who} · {lineup.formation} · {timeAgo(lineup.created_at)}
          </p>
        </header>

        <MiniPitch
          formation={lineup.formation}
          slots={slots}
          title={title}
          large
        />

        <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          {named.map((s) => (
            <li key={s.slotId} className="flex items-center gap-1.5">
              <span className="w-8 shrink-0 text-xs font-bold text-slate-400">
                {s.role}
              </span>
              <span className="truncate text-slate-800">{s.playerName}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 border-t border-slate-200 pt-4">
          <ShareButtons
            url={absoluteUrl(`/lineup/${id}`)}
            title={`${title} — a Chelsea XI on The Blues Collective`}
          />
        </div>
      </article>
    </div>
  );
}
