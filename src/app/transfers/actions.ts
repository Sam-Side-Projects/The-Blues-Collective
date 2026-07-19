"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { checkText } from "@/lib/moderation";
import {
  WINDOW_BUDGET,
  moveCost,
  moveRaise,
  type MarketPlayer,
} from "@/lib/marketValues";
import { playerKey, weightedMedianFee } from "@/lib/communityValue";

export type ActionResult = { ok: boolean; message: string };

export type MovePlayer = {
  name: string;
  position: string;
  club: string;
  value: number;
};

export type SearchedPlayer = {
  name: string;
  position: string;
  club: string;
  age: number | null;
};

/**
 * Search the Premier League player pool for the Transfer Centre. Matches on
 * name (case-insensitive, partial), returns up to 20. Reads only our own DB —
 * the pool is kept fresh by the weekly sync job.
 */
export async function searchPlayers(query: string): Promise<SearchedPlayer[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("pl_players")
    .select("name, position, club, age")
    .eq("is_active", true)
    .ilike("name", `%${q}%`)
    .order("name", { ascending: true })
    .limit(20);

  return (data ?? []).map((p) => ({
    name: p.name,
    position: p.position,
    club: p.club,
    age: p.age,
  }));
}

export type RebuildMoves = {
  sold: MovePlayer[];
  loaned_out: MovePlayer[];
  bought: MovePlayer[];
  loaned_in: MovePlayer[];
};

/**
 * Recompute spend/raised/net on the server from the submitted moves so we
 * never trust the client's numbers, and enforce the budget rule.
 */
function tallyMoves(moves: RebuildMoves) {
  // Fees are fan-proposed now, so sanitise every value to a sane, non-negative
  // number before it touches the budget maths.
  const clean = (v: number) =>
    Number.isFinite(v) ? Math.max(0, Math.min(1000, v)) : 0;
  let spend = 0;
  let raised = 0;
  for (const p of moves.bought) spend += moveCost("buy", clean(p.value));
  for (const p of moves.loaned_in) spend += moveCost("loan_in", clean(p.value));
  for (const p of moves.sold) raised += moveRaise("sell", clean(p.value));
  for (const p of moves.loaned_out) raised += moveRaise("loan_out", clean(p.value));
  spend = Math.round(spend * 10) / 10;
  raised = Math.round(raised * 10) / 10;
  const budgetLeft = Math.round((WINDOW_BUDGET + raised - spend) * 10) / 10;
  const net = Math.round((spend - raised) * 10) / 10;
  return { spend, raised, net, budgetLeft };
}

/**
 * Recalculate "Fans say: ~€Xm" for one player from every fee ever proposed for
 * them, weighted by how many fans called each fee realistic. Derived data, so
 * it's written with the admin client. Silently does nothing on failure — a
 * community number is a nice-to-have, never a reason to fail someone's publish.
 */
async function recomputeCommunityValue(key: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: proposals } = await admin
      .from("player_fee_proposals")
      .select("id, player_name, fee")
      .eq("player_key", key);
    if (!proposals || proposals.length === 0) return;

    const { data: votes } = await admin
      .from("player_fee_votes")
      .select("proposal_id, verdict")
      .in(
        "proposal_id",
        proposals.map((p) => p.id)
      );

    const tally = new Map<string, { realistic: number; noChance: number }>();
    for (const p of proposals) tally.set(p.id, { realistic: 0, noChance: 0 });
    for (const v of votes ?? []) {
      const t = tally.get(v.proposal_id);
      if (!t) continue;
      if (v.verdict === "realistic") t.realistic++;
      else t.noChance++;
    }

    const result = weightedMedianFee(
      proposals.map((p) => {
        const t = tally.get(p.id) ?? { realistic: 0, noChance: 0 };
        return { fee: Number(p.fee), realistic: t.realistic, noChance: t.noChance };
      })
    );

    if (!result) {
      // Not enough agreement yet — show nothing rather than a shaky number.
      await admin.from("player_community_values").delete().eq("player_key", key);
      return;
    }

    await admin.from("player_community_values").upsert(
      {
        player_key: key,
        player_name: proposals[proposals.length - 1].player_name,
        community_value: result.value,
        proposal_count: result.count,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "player_key" }
    );
  } catch {
    // Derived data only — never block the user's action on this.
  }
}

/**
 * What fans reckon a player is worth, for context only. The Transfer Centre
 * shows this as text next to a BLANK fee box — it is never pre-filled, so it
 * can't anchor the fee someone types.
 */
export async function getCommunityValue(
  name: string
): Promise<{ value: number; count: number } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("player_community_values")
    .select("community_value, proposal_count")
    .eq("player_key", playerKey(name))
    .maybeSingle();
  if (!data) return null;
  return { value: Number(data.community_value), count: data.proposal_count };
}

/** Publish a rebuild to the Community Rebuilds board. */
export async function publishRebuild(input: {
  title: string;
  moves: RebuildMoves;
  note: string;
  postToFeed: boolean;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Please log in to publish a rebuild." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_banned")
    .eq("id", user.id)
    .single();
  if (profile?.is_banned) {
    return { ok: false, message: "Your account has been suspended." };
  }

  const { spend, raised, net, budgetLeft } = tallyMoves(input.moves);
  if (budgetLeft < 0) {
    return {
      ok: false,
      message: `That rebuild goes over budget by €${Math.abs(budgetLeft)}m. Sell a player or drop a signing.`,
    };
  }

  const totalMoves =
    input.moves.sold.length +
    input.moves.loaned_out.length +
    input.moves.bought.length +
    input.moves.loaned_in.length;
  if (totalMoves === 0) {
    return { ok: false, message: "Make at least one move before publishing." };
  }

  if (input.note) {
    const noteCheck = checkText(input.note);
    if (!noteCheck.ok) return { ok: false, message: noteCheck.reason };
  }
  if (input.title) {
    const titleCheck = checkText(input.title);
    if (!titleCheck.ok) return { ok: false, message: titleCheck.reason };
  }

  const { data: rebuild, error } = await supabase
    .from("rebuilds")
    .insert({
      owner: user.id,
      title: input.title || "My rebuild",
      moves: input.moves,
      spend,
      raised,
      net,
      note: input.note || null,
    })
    .select("id")
    .single();

  if (error || !rebuild) {
    return { ok: false, message: "Could not publish your rebuild. Please try again." };
  }

  // Every fee the fan committed to becomes a permanent proposal others can
  // vote on, and feeds the "Fans say" number for that player.
  const incoming = [
    ...input.moves.bought.map((p) => ({ p, kind: "buy" as const })),
    ...input.moves.loaned_in.map((p) => ({ p, kind: "loan" as const })),
  ];
  const proposalRows = incoming
    .filter(({ p }) => Number.isFinite(p.value) && p.value > 0)
    .map(({ p, kind }) => ({
      player_key: playerKey(p.name),
      player_name: p.name,
      position: p.position,
      club: p.club,
      move_kind: kind,
      fee: Math.max(0, Math.min(1000, p.value)),
      rebuild_id: rebuild.id,
      proposer: user.id,
    }));

  if (proposalRows.length > 0) {
    const { error: propError } = await supabase
      .from("player_fee_proposals")
      .insert(proposalRows);
    if (!propError) {
      for (const key of new Set(proposalRows.map((r) => r.player_key))) {
        await recomputeCommunityValue(key);
      }
    }
  }

  if (input.postToFeed) {
    await supabase.from("posts").insert({
      author: user.id,
      body: `I've published my transfer window rebuild: ${input.title || "My rebuild"} (net spend €${net}m). Come vote!`,
      tag: "Transfers",
      rebuild_id: rebuild.id,
    });
    revalidatePath("/shed");
  }

  revalidatePath("/transfers/rebuilds");
  return { ok: true, message: "Rebuild published!" };
}

/** Upvote a rebuild (one per user; toggles off if already voted). */
export async function toggleRebuildVote(rebuildId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Please log in to vote." };

  const { data: existing } = await supabase
    .from("rebuild_votes")
    .select("rebuild_id")
    .eq("rebuild_id", rebuildId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("rebuild_votes")
      .delete()
      .eq("rebuild_id", rebuildId)
      .eq("user_id", user.id);
  } else {
    await supabase
      .from("rebuild_votes")
      .insert({ rebuild_id: rebuildId, user_id: user.id });
  }

  revalidatePath("/transfers/rebuilds");
  return { ok: true, message: "" };
}

/**
 * Vote on whether a proposed fee is realistic. One verdict per fan per fee;
 * clicking the same verdict again clears it. Recomputes the player's "Fans say"
 * number afterwards.
 */
export async function voteOnFee(
  proposalId: string,
  verdict: "realistic" | "no_chance"
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Please log in to vote." };

  const { data: existing } = await supabase
    .from("player_fee_votes")
    .select("verdict")
    .eq("proposal_id", proposalId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing?.verdict === verdict) {
    await supabase
      .from("player_fee_votes")
      .delete()
      .eq("proposal_id", proposalId)
      .eq("user_id", user.id);
  } else if (existing) {
    await supabase
      .from("player_fee_votes")
      .update({ verdict })
      .eq("proposal_id", proposalId)
      .eq("user_id", user.id);
  } else {
    const { error } = await supabase
      .from("player_fee_votes")
      .insert({ proposal_id: proposalId, user_id: user.id, verdict });
    if (error) return { ok: false, message: "Could not record your vote." };
  }

  const admin = createAdminClient();
  const { data: proposal } = await admin
    .from("player_fee_proposals")
    .select("player_key")
    .eq("id", proposalId)
    .maybeSingle();
  if (proposal) await recomputeCommunityValue(proposal.player_key);

  revalidatePath("/transfers/rebuilds");
  return { ok: true, message: "" };
}

/** Delete a rebuild (owner or admin only — enforced by row-level security). */
export async function deleteRebuild(rebuildId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Please log in." };

  const { error } = await supabase.from("rebuilds").delete().eq("id", rebuildId);
  if (error) return { ok: false, message: "Could not delete this rebuild." };

  revalidatePath("/transfers/rebuilds");
  return { ok: true, message: "Rebuild deleted." };
}

/* ===================== Admin: Transfer News ===================== */

async function requireAdmin(): Promise<
  { supabase: Awaited<ReturnType<typeof createClient>> } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in." };
  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!me?.is_admin) return { error: "Only admins can manage transfer news." };
  return { supabase };
}

/** Admin-only: add a curated transfer-news item. */
export async function addTransferNews(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, message: auth.error };

  const headline = String(formData.get("headline") ?? "").trim();
  const sourceUrl = String(formData.get("source_url") ?? "").trim();
  const newsDate = String(formData.get("news_date") ?? "").trim();

  if (!headline) return { ok: false, message: "Please enter a headline." };

  // Use admin client so the insert passes the admin-only RLS policy reliably.
  const admin = createAdminClient();
  const { error } = await admin.from("transfer_news").insert({
    headline,
    source_url: sourceUrl || null,
    news_date: newsDate || new Date().toISOString().slice(0, 10),
  });

  if (error) return { ok: false, message: "Could not add the news item." };
  revalidatePath("/transfers");
  return { ok: true, message: "News item added." };
}

/** Admin-only: delete a transfer-news item. */
export async function deleteTransferNews(id: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, message: auth.error };

  const admin = createAdminClient();
  const { error } = await admin.from("transfer_news").delete().eq("id", id);
  if (error) return { ok: false, message: "Could not delete the news item." };
  revalidatePath("/transfers");
  return { ok: true, message: "News item deleted." };
}
