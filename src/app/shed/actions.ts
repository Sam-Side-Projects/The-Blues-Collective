"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkText } from "@/lib/moderation";

export type ActionResult = { ok: boolean; message: string };

const VALID_TAGS = ["Match", "Transfers", "Debate", "Fans"];
const MAX_BODY = 500;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

type ActiveUser = {
  user: NonNullable<
    Awaited<ReturnType<Awaited<ReturnType<typeof createClient>>["auth"]["getUser"]>>["data"]["user"]
  >;
  supabase: Awaited<ReturnType<typeof createClient>>;
  isAdmin: boolean;
};

/** Look up the logged-in user and make sure they're allowed to post. */
async function requireActiveUser(): Promise<ActiveUser | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in first." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_banned, is_admin")
    .eq("id", user.id)
    .single();

  if (profile?.is_banned) {
    return { error: "Your account has been suspended and can't post." };
  }
  return { user, supabase, isAdmin: profile?.is_admin ?? false };
}

/** Create a short-form post, optionally with an image. */
export async function createPost(formData: FormData): Promise<ActionResult> {
  const auth = await requireActiveUser();
  if ("error" in auth) return { ok: false, message: auth.error };
  const { user, supabase } = auth;

  const body = String(formData.get("body") ?? "").trim();
  const tag = String(formData.get("tag") ?? "").trim();
  const image = formData.get("image");

  if (!body) return { ok: false, message: "Write something before posting." };
  if (body.length > MAX_BODY) {
    return { ok: false, message: `Posts are limited to ${MAX_BODY} characters.` };
  }
  if (tag && !VALID_TAGS.includes(tag)) {
    return { ok: false, message: "Please choose a valid tag." };
  }

  const wordCheck = checkText(body);
  if (!wordCheck.ok) return { ok: false, message: wordCheck.reason };

  // Optional image upload — handled server-side with the admin client so we
  // don't need browser-side storage permissions.
  let imageUrl: string | null = null;
  if (image && image instanceof File && image.size > 0) {
    if (image.size > MAX_IMAGE_BYTES) {
      return { ok: false, message: "Image must be 2MB or smaller." };
    }
    if (!image.type.startsWith("image/")) {
      return { ok: false, message: "Only image files can be attached." };
    }
    const admin = createAdminClient();
    const ext = image.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${user.id}/${Date.now()}.${ext}`;
    const bytes = new Uint8Array(await image.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from("post-images")
      .upload(path, bytes, { contentType: image.type, upsert: false });
    if (upErr) {
      return { ok: false, message: "Sorry, the image upload failed. Try a smaller file." };
    }
    const { data: pub } = admin.storage.from("post-images").getPublicUrl(path);
    imageUrl = pub.publicUrl;
  }

  const { error } = await supabase.from("posts").insert({
    author: user.id,
    body,
    tag: tag || null,
    image_url: imageUrl,
  });

  if (error) return { ok: false, message: "Could not save your post. Please try again." };

  revalidatePath("/shed");
  return { ok: true, message: "Posted!" };
}

/** Like or unlike a post (toggle). */
export async function toggleLike(postId: string): Promise<ActionResult> {
  const auth = await requireActiveUser();
  if ("error" in auth) return { ok: false, message: auth.error };
  const { user, supabase } = auth;

  const { data: existing } = await supabase
    .from("post_likes")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", user.id);
  } else {
    await supabase.from("post_likes").insert({ post_id: postId, user_id: user.id });
  }

  revalidatePath("/shed");
  return { ok: true, message: "" };
}

/** Add a comment (optionally a reply to another comment — one level deep). */
export async function addComment(
  postId: string,
  body: string,
  parentId: string | null
): Promise<ActionResult> {
  const auth = await requireActiveUser();
  if ("error" in auth) return { ok: false, message: auth.error };
  const { user, supabase } = auth;

  const text = body.trim();
  if (!text) return { ok: false, message: "Write something first." };
  if (text.length > MAX_BODY) {
    return { ok: false, message: `Comments are limited to ${MAX_BODY} characters.` };
  }
  const wordCheck = checkText(text);
  if (!wordCheck.ok) return { ok: false, message: wordCheck.reason };

  // Keep threading to a single level: if replying to a comment that itself
  // has a parent, attach to the top-level parent instead.
  let effectiveParent = parentId;
  if (parentId) {
    const { data: parent } = await supabase
      .from("comments")
      .select("parent_id")
      .eq("id", parentId)
      .single();
    if (parent?.parent_id) effectiveParent = parent.parent_id;
  }

  const { error } = await supabase.from("comments").insert({
    post_id: postId,
    author: user.id,
    parent_id: effectiveParent,
    body: text,
  });

  if (error) return { ok: false, message: "Could not post your comment. Try again." };

  revalidatePath("/shed");
  return { ok: true, message: "" };
}

/** Report a post or comment for moderator review. */
export async function reportContent(
  targetType: "post" | "comment",
  targetId: string,
  reason: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Please log in to report content." };

  const { error } = await supabase.from("reports").insert({
    reporter: user.id,
    target_type: targetType,
    target_id: targetId,
    reason: reason.trim() || null,
  });

  if (error) return { ok: false, message: "Could not submit your report. Try again." };
  return { ok: true, message: "Thanks — a moderator will review this." };
}

/** Delete a post (author or admin only — enforced by DB row-level security). */
export async function deletePost(postId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Please log in." };

  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) return { ok: false, message: "Could not delete this post." };

  revalidatePath("/shed");
  return { ok: true, message: "Post deleted." };
}

/** Delete a comment (author or admin only). */
export async function deleteComment(commentId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Please log in." };

  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) return { ok: false, message: "Could not delete this comment." };

  revalidatePath("/shed");
  return { ok: true, message: "Comment deleted." };
}

/**
 * Ensure a pinned "matchday thread" exists for any fixture kicking off within
 * the next 2 hours. Called when the Shed page loads. Authored by an admin
 * account; if there's no admin yet, it quietly does nothing.
 */
export async function ensureMatchdayThreads(): Promise<void> {
  const admin = createAdminClient();

  const now = new Date();
  const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const { data: fixtures } = await admin
    .from("fixtures")
    .select("id, home_team, away_team, kickoff")
    .gte("kickoff", now.toISOString())
    .lte("kickoff", in2h.toISOString());

  if (!fixtures || fixtures.length === 0) return;

  // Find an admin to author the thread.
  const { data: adminProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("is_admin", true)
    .limit(1)
    .maybeSingle();
  if (!adminProfile) return;

  for (const f of fixtures) {
    const { data: existing } = await admin
      .from("posts")
      .select("id")
      .eq("fixture_id", f.id)
      .eq("is_pinned", true)
      .maybeSingle();
    if (existing) continue;

    await admin.from("posts").insert({
      author: adminProfile.id,
      body: `Matchday! ${f.home_team} v ${f.away_team} kicks off soon. Drop your score predictions, team-sheet hopes, and match chat here. 💙`,
      tag: "Match",
      is_pinned: true,
      fixture_id: f.id,
    });
  }
}

/** Admin-only: remove all seeded demo content across the site. */
export async function clearDemoContent(): Promise<ActionResult> {
  const auth = await requireActiveUser();
  if ("error" in auth) return { ok: false, message: auth.error };
  if (!auth.isAdmin) return { ok: false, message: "Only admins can do this." };

  const admin = createAdminClient();
  await admin.from("comments").delete().eq("is_demo", true);
  await admin.from("posts").delete().eq("is_demo", true);
  await admin.from("articles").delete().eq("is_demo", true);
  await admin.from("rebuilds").delete().eq("is_demo", true);

  revalidatePath("/shed");
  return { ok: true, message: "Demo content cleared." };
}

/** Admin-only: ban a user so they can no longer post or comment. */
export async function banUser(targetUserId: string): Promise<ActionResult> {
  const auth = await requireActiveUser();
  if ("error" in auth) return { ok: false, message: auth.error };
  if (!auth.isAdmin) return { ok: false, message: "Only admins can ban users." };

  // Use the admin client so the update isn't blocked by row-level security
  // (which only lets a user edit their own profile).
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ is_banned: true })
    .eq("id", targetUserId);

  if (error) return { ok: false, message: "Could not ban this user." };

  revalidatePath("/shed");
  return { ok: true, message: "User banned." };
}
