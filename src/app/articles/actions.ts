"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { checkText } from "@/lib/moderation";

export type ActionResult = { ok: boolean; message: string };

const MAX_TITLE = 140;
const MAX_BODY = 20000;

type ActiveUser = {
  user: NonNullable<
    Awaited<
      ReturnType<Awaited<ReturnType<typeof createClient>>["auth"]["getUser"]>
    >["data"]["user"]
  >;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

/** Look up the logged-in user and make sure they aren't banned. */
async function requireActiveUser(): Promise<ActiveUser | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in first." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_banned")
    .eq("id", user.id)
    .single();

  if (profile?.is_banned) {
    return { error: "Your account has been suspended and can't publish." };
  }
  return { user, supabase };
}

/**
 * Publish a new article. On success, redirects to the new article page.
 * Returns an error string (via thrown redirect avoidance) only on failure.
 */
export async function createArticle(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const auth = await requireActiveUser();
  if ("error" in auth) return { ok: false, message: auth.error };
  const { user, supabase } = auth;

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!title) return { ok: false, message: "Please give your article a title." };
  if (title.length > MAX_TITLE) {
    return { ok: false, message: `Title must be under ${MAX_TITLE} characters.` };
  }
  if (body.length < 50) {
    return {
      ok: false,
      message: "Your article is very short — please write at least a paragraph.",
    };
  }
  if (body.length > MAX_BODY) {
    return { ok: false, message: "That article is too long. Please trim it a little." };
  }

  const titleCheck = checkText(title);
  if (!titleCheck.ok) return { ok: false, message: titleCheck.reason };
  const bodyCheck = checkText(body);
  if (!bodyCheck.ok) return { ok: false, message: bodyCheck.reason };

  const { data, error } = await supabase
    .from("articles")
    .insert({ author: user.id, title, body })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, message: "Could not publish your article. Please try again." };
  }

  revalidatePath("/articles");
  redirect(`/articles/${data.id}`);
}

/** Clap for an article (one per user; toggles off if already clapped). */
export async function toggleClap(articleId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Please log in to clap." };

  const { data: existing } = await supabase
    .from("article_claps")
    .select("article_id")
    .eq("article_id", articleId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("article_claps")
      .delete()
      .eq("article_id", articleId)
      .eq("user_id", user.id);
  } else {
    await supabase
      .from("article_claps")
      .insert({ article_id: articleId, user_id: user.id });
  }

  revalidatePath(`/articles/${articleId}`);
  revalidatePath("/articles");
  return { ok: true, message: "" };
}

/** Report an article for moderator review. */
export async function reportArticle(
  articleId: string,
  reason: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Please log in to report." };

  const { error } = await supabase.from("reports").insert({
    reporter: user.id,
    target_type: "article",
    target_id: articleId,
    reason: reason.trim() || null,
  });

  if (error) return { ok: false, message: "Could not submit your report." };
  return { ok: true, message: "Thanks — a moderator will review this." };
}

/** Delete an article (author or admin only — enforced by row-level security). */
export async function deleteArticle(articleId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Please log in." };

  const { error } = await supabase.from("articles").delete().eq("id", articleId);
  if (error) return { ok: false, message: "Could not delete this article." };

  revalidatePath("/articles");
  redirect("/articles");
}

/** Admin-only: ban an article's author. */
export async function banAuthor(authorId: string): Promise<ActionResult> {
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
  if (!me?.is_admin) return { ok: false, message: "Only admins can ban users." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ is_banned: true })
    .eq("id", authorId);

  if (error) return { ok: false, message: "Could not ban this user." };
  revalidatePath("/articles");
  return { ok: true, message: "User banned." };
}
