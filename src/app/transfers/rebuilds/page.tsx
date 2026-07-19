import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import RebuildCard, { type RebuildCardData } from "@/components/RebuildCard";

export const metadata = {
  title: "Community Rebuilds — The Blues Collective",
};
export const dynamic = "force-dynamic";

type RebuildRow = {
  id: string;
  owner: string;
  title: string;
  moves: RebuildCardData["moves"];
  spend: number;
  raised: number;
  net: number;
  note: string | null;
  created_at: string;
  is_demo: boolean;
  owner_profile: { username: string } | null;
};

export default async function RebuildsPage() {
  const user = await getCurrentUser();
  const viewer = user ? { id: user.id, isAdmin: user.isAdmin } : null;
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("rebuilds")
    .select(
      `id, owner, title, moves, spend, raised, net, note, created_at, is_demo,
       owner_profile:profiles!rebuilds_owner_fkey(username)`
    )
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<RebuildRow[]>();

  const rebuilds = rows ?? [];

  // Vote counts + which ones the viewer voted for.
  const voteCounts = new Map<string, number>();
  const votedByMe = new Set<string>();
  const weeklyVotes = new Map<string, number>(); // votes cast in the last 7 days
  if (rebuilds.length > 0) {
    const { data: votes } = await supabase
      .from("rebuild_votes")
      .select("rebuild_id, user_id, created_at")
      .in(
        "rebuild_id",
        rebuilds.map((r) => r.id)
      );
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const v of votes ?? []) {
      voteCounts.set(v.rebuild_id, (voteCounts.get(v.rebuild_id) ?? 0) + 1);
      if (viewer && v.user_id === viewer.id) votedByMe.add(v.rebuild_id);
      if (new Date(v.created_at).getTime() >= weekAgo) {
        weeklyVotes.set(v.rebuild_id, (weeklyVotes.get(v.rebuild_id) ?? 0) + 1);
      }
    }
  }

  // Fee proposals for these rebuilds, so each signing's fee can be voted on.
  // Keyed rebuild id -> player name -> the proposal and its tally.
  const feesByRebuild = new Map<string, RebuildCardData["fees"]>();
  if (rebuilds.length > 0) {
    const { data: proposals } = await supabase
      .from("player_fee_proposals")
      .select("id, rebuild_id, player_name, fee")
      .in(
        "rebuild_id",
        rebuilds.map((r) => r.id)
      );

    const tally = new Map<string, { realistic: number; noChance: number; mine: string | null }>();
    if (proposals && proposals.length > 0) {
      for (const p of proposals) tally.set(p.id, { realistic: 0, noChance: 0, mine: null });
      const { data: feeVotes } = await supabase
        .from("player_fee_votes")
        .select("proposal_id, user_id, verdict")
        .in(
          "proposal_id",
          proposals.map((p) => p.id)
        );
      for (const v of feeVotes ?? []) {
        const t = tally.get(v.proposal_id);
        if (!t) continue;
        if (v.verdict === "realistic") t.realistic++;
        else t.noChance++;
        if (viewer && v.user_id === viewer.id) t.mine = v.verdict;
      }

      for (const p of proposals) {
        if (!p.rebuild_id) continue;
        const t = tally.get(p.id)!;
        const forRebuild = feesByRebuild.get(p.rebuild_id) ?? {};
        forRebuild[p.player_name] = {
          proposalId: p.id,
          realistic: t.realistic,
          noChance: t.noChance,
          myVerdict: (t.mine as "realistic" | "no_chance" | null) ?? null,
        };
        feesByRebuild.set(p.rebuild_id, forRebuild);
      }
    }
  }

  const cards: RebuildCardData[] = rebuilds.map((r) => ({
    id: r.id,
    ownerId: r.owner,
    ownerName: r.owner_profile?.username ?? "fan",
    title: r.title,
    moves: r.moves,
    spend: r.spend,
    raised: r.raised,
    net: r.net,
    note: r.note,
    createdAt: r.created_at,
    isDemo: r.is_demo,
    voteCount: voteCounts.get(r.id) ?? 0,
    votedByMe: votedByMe.has(r.id),
    fees: feesByRebuild.get(r.id) ?? {},
  }));

  // Sort by total votes (desc), then newest.
  cards.sort((a, b) => {
    if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Weekly top: rebuild with the most votes in the last 7 days (min 1).
  let weeklyTopId: string | null = null;
  let best = 0;
  for (const [id, count] of weeklyVotes) {
    if (count > best) {
      best = count;
      weeklyTopId = id;
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">
            Community Rebuilds
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Vote for your favourite window rebuilds — one upvote each.
          </p>
        </div>
        <Link
          href="/transfers"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Build yours
        </Link>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-16 text-center text-slate-500">
          No rebuilds yet — be the first to publish one!
        </div>
      ) : (
        <div className="space-y-4">
          {cards.map((c) => (
            <RebuildCard
              key={c.id}
              rebuild={c}
              viewer={viewer}
              isWeeklyTop={c.id === weeklyTopId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
