"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ratePlayers,
  bestSix,
  weeklyDraws,
  currentWeekKey,
  STARTING_BANKROLL,
  type Player,
  type SlotId,
} from "@/lib/game95";

export type ActionResult = { ok: boolean; message: string };

/** One pick the player submitted for the weekly challenge. */
export type WeeklyPick = { slotId: SlotId; playerId: number };

/** Load the roster server-side (DB first, JSON fallback) — same as the page. */
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

function allSeasons(players: Player[]): string[] {
  const s = new Set<string>();
  for (const p of players) for (const x of p.seasons) s.add(x);
  return [...s].sort();
}

/**
 * Save a scored weekly attempt. The score is RECOMPUTED on the server from the
 * player ids + the week's fixed seasons, so the client can never submit a fake
 * total. One attempt per user per week is enforced by a unique DB index.
 */
export async function saveWeeklyResult(
  picks: WeeklyPick[]
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Please log in to save a weekly score." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_banned")
    .eq("id", user.id)
    .single();
  if (profile?.is_banned) return { ok: false, message: "Your account is suspended." };

  const weekKey = currentWeekKey();
  const players = await loadRoster();
  const byId = new Map(players.map((p) => [p.id, p]));
  const draws = weeklyDraws(players, allSeasons(players), weekKey);

  if (picks.length !== draws.length) {
    return { ok: false, message: "Fill all six positions before submitting." };
  }

  // Validate each pick: right slot/season, real, affordable, no repeats.
  const chosen: Player[] = [];
  const seen = new Set<number>();
  let spent = 0;
  for (let i = 0; i < draws.length; i++) {
    const pick = picks.find((p) => p.slotId === draws[i].slotId);
    if (!pick) return { ok: false, message: "A position is missing a player." };
    const p = byId.get(pick.playerId);
    if (!p) return { ok: false, message: "Unknown player in your team." };
    if (seen.has(p.id)) return { ok: false, message: "You can only sign each player once." };
    if (!p.seasons.includes(draws[i].season)) {
      return { ok: false, message: "A player didn't play in the drawn season." };
    }
    seen.add(p.id);
    spent += p.priceM;
    chosen.push(p);
  }
  if (spent > STARTING_BANKROLL) {
    return { ok: false, message: "Your team is over the £500m budget." };
  }

  const rating = ratePlayers(
    chosen.map((p, i) => ({
      slotId: draws[i].slotId,
      attack: p.attack,
      defence: p.defence,
    }))
  );
  const best = bestSix(players, draws, STARTING_BANKROLL);

  const admin = createAdminClient();
  const { error } = await admin.from("game_results").insert({
    owner: user.id,
    week_key: weekKey,
    is_practice: false,
    picks: chosen.map((p, i) => ({
      slot: draws[i].slotId,
      name: p.name,
      season: draws[i].season,
      priceM: p.priceM,
      attack: p.attack,
      defence: p.defence,
    })),
    spent,
    respins: 0,
    projected_points: rating.projectedPoints,
    projected_conceded: rating.projectedConceded,
    best_points: best?.rating.projectedPoints ?? null,
  });

  if (error) {
    // Unique-index violation => already played this week.
    if (error.code === "23505") {
      return { ok: false, message: "You've already logged your weekly score. Come back Monday!" };
    }
    return { ok: false, message: "Could not save your score. Please try again." };
  }

  revalidatePath("/95-point-game/weekly");
  return { ok: true, message: "Weekly score saved!" };
}

/**
 * Post the shareable card (a PNG the browser drew) to The Shed. Only ever
 * called on an explicit button click. Uploads to the existing post-images
 * bucket and creates a post.
 */
export async function postCardToShed(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Please log in to post to The Shed." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_banned")
    .eq("id", user.id)
    .single();
  if (profile?.is_banned) return { ok: false, message: "Your account is suspended." };

  const image = formData.get("card");
  const body = String(formData.get("body") ?? "").trim();
  if (!(image instanceof File) || image.size === 0) {
    return { ok: false, message: "No card image to post." };
  }
  if (image.size > 3_000_000) {
    return { ok: false, message: "Card image is too large." };
  }

  const admin = createAdminClient();
  const path = `${user.id}/95pt-${Date.now()}.png`;
  const bytes = new Uint8Array(await image.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from("post-images")
    .upload(path, bytes, { contentType: "image/png", upsert: false });
  if (upErr) return { ok: false, message: "Could not upload your card. Please try again." };

  const { data: pub } = admin.storage.from("post-images").getPublicUrl(path);

  const { error } = await supabase.from("posts").insert({
    author: user.id,
    body: body || "My 95-Point Game card 🔵",
    tag: "Fans",
    image_url: pub.publicUrl,
  });
  if (error) return { ok: false, message: "Could not post to The Shed." };

  revalidatePath("/shed");
  return { ok: true, message: "Posted to The Shed!" };
}
