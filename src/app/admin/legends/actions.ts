"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string };

/** Confirm the caller is a logged-in admin before any write. */
async function requireAdmin(): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Please log in." };
  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!me?.is_admin) return { ok: false, message: "Only admins can edit the roster." };
  return { ok: true };
}

/** Read a numeric field from the form, returning null for blanks. */
function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Admin-only: save one player's game numbers (price/attack/defence) and the
 * exclude toggle. Saving also clears the PLACEHOLDER note — editing IS the
 * review — so the player drops off the "needs review" filter.
 */
export async function saveLegend(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return { ok: false, message: "Missing player id." };

  const priceM = num(formData.get("price_m"));
  const attack = num(formData.get("attack"));
  const defence = num(formData.get("defence"));
  const excluded = formData.get("excluded") === "on";

  // Clamp ratings 0-100; price must be >= 0.
  const clamp100 = (n: number | null) =>
    n == null ? null : Math.max(0, Math.min(100, Math.round(n)));

  const admin = createAdminClient();
  const { error } = await admin
    .from("blues_legends")
    .update({
      price_m: priceM == null ? null : Math.max(0, priceM),
      attack: clamp100(attack),
      defence: clamp100(defence),
      excluded,
      note: null, // reviewed — drop the PLACEHOLDER flag
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { ok: false, message: "Could not save. Please try again." };
  revalidatePath("/admin/legends");
  return { ok: true, message: "Saved." };
}

/** Admin-only: quick exclude/include toggle without touching numbers. */
export async function toggleLegendExcluded(
  id: number,
  excluded: boolean
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const admin = createAdminClient();
  const { error } = await admin
    .from("blues_legends")
    .update({ excluded, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, message: "Could not update." };
  revalidatePath("/admin/legends");
  return { ok: true, message: "" };
}
