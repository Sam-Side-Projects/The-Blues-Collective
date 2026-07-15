"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error: string | null };

/**
 * Create a new account with email + password and a chosen username.
 * The username is stored in user metadata; a DB trigger turns it into a
 * profile row automatically.
 */
export async function signUp(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const username = String(formData.get("username") ?? "").trim();

  if (!email || !password || !username) {
    return { error: "Please fill in your email, username, and password." };
  }
  if (username.length < 3 || username.length > 20) {
    return { error: "Username must be between 3 and 20 characters." };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { error: "Username can only use letters, numbers, and underscores." };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  const supabase = await createClient();

  // Make sure the username isn't already taken (friendly message).
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (existing) {
    return { error: "That username is already taken — try another." };
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });

  if (error) {
    return { error: friendlyAuthError(error.message) };
  }

  revalidatePath("/", "layout");
  redirect("/lineup");
}

/** Log in with email + password. */
export async function logIn(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Please enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: friendlyAuthError(error.message) };
  }

  revalidatePath("/", "layout");
  redirect("/lineup");
}

/** Log out and return home. */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

/** Turn raw Supabase auth errors into plain-English messages. */
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) {
    return "That email or password doesn't match. Please try again.";
  }
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "An account with that email already exists. Try logging in instead.";
  }
  if (m.includes("not confirmed") || m.includes("email not confirmed")) {
    return "Your email hasn't been confirmed yet. Check your inbox for the confirmation link — or ask the site owner to turn off email confirmation.";
  }
  if (m.includes("rate limit")) {
    return "Too many attempts in a short time. Please wait a few minutes and try again.";
  }
  if (m.includes("email address") && m.includes("invalid")) {
    return "That email address was rejected. Please use a different email.";
  }
  if (m.includes("password")) {
    return "Password must be at least 6 characters.";
  }
  return "Something went wrong. Please try again in a moment.";
}
