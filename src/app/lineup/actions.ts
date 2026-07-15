"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SavedSlot = {
  slotId: string;
  role: string;
  playerId: number | null;
  playerName: string | null;
};

export type SaveResult = {
  ok: boolean;
  message: string;
  lineupId?: string;
};

/**
 * Save a lineup for the logged-in user. If postToFeed is true, also create a
 * post in The Shed that links to the lineup.
 */
export async function saveLineup(input: {
  title: string;
  formation: string;
  slots: SavedSlot[];
  fixtureId: number | null;
  postToFeed: boolean;
}): Promise<SaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Please log in to save a lineup." };
  }

  const filled = input.slots.filter((s) => s.playerId != null).length;
  if (filled === 0) {
    return { ok: false, message: "Add at least one player before saving." };
  }

  const { data: lineup, error } = await supabase
    .from("lineups")
    .insert({
      owner: user.id,
      title: input.title || "My XI",
      formation: input.formation,
      slots: input.slots,
      fixture_id: input.fixtureId,
    })
    .select("id")
    .single();

  if (error || !lineup) {
    return { ok: false, message: "Could not save your lineup. Please try again." };
  }

  if (input.postToFeed) {
    const { error: postError } = await supabase.from("posts").insert({
      author: user.id,
      body: input.title
        ? `Here's my XI: ${input.title}`
        : "Here's my latest XI — thoughts?",
      tag: "Debate",
      lineup_id: lineup.id,
    });
    if (postError) {
      return {
        ok: true,
        lineupId: lineup.id,
        message:
          "Lineup saved, but we couldn't post it to the feed. You can try posting again later.",
      };
    }
    revalidatePath("/shed");
  }

  return {
    ok: true,
    lineupId: lineup.id,
    message: input.postToFeed
      ? "Lineup saved and posted to The Shed!"
      : "Lineup saved!",
  };
}
