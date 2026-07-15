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

export type ActionResult = { ok: boolean; message: string };

export type MovePlayer = {
  name: string;
  position: string;
  club: string;
  value: number;
};

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
  let spend = 0;
  let raised = 0;
  for (const p of moves.bought) spend += moveCost("buy", p.value);
  for (const p of moves.loaned_in) spend += moveCost("loan_in", p.value);
  for (const p of moves.sold) raised += moveRaise("sell", p.value);
  for (const p of moves.loaned_out) raised += moveRaise("loan_out", p.value);
  spend = Math.round(spend * 10) / 10;
  raised = Math.round(raised * 10) / 10;
  const budgetLeft = Math.round((WINDOW_BUDGET + raised - spend) * 10) / 10;
  const net = Math.round((spend - raised) * 10) / 10;
  return { spend, raised, net, budgetLeft };
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
