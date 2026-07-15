import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
  username: string;
  isAdmin: boolean;
} | null;

/**
 * Returns the logged-in user plus their profile info, or null if signed out.
 * Safe to call from any Server Component / layout.
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, is_admin")
    .eq("id", user.id)
    .single();

  return {
    id: user.id,
    email: user.email ?? null,
    username: profile?.username ?? "fan",
    isAdmin: profile?.is_admin ?? false,
  };
}
