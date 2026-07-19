import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import FixturesAdmin, { type ManualFixture } from "./FixturesAdmin";

export const metadata = { title: "Admin · Fixtures — The Blues Collective" };
export const dynamic = "force-dynamic";

export default async function FixturesAdminPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-800">Fixtures admin</h1>
        <p className="mt-3 text-slate-600">
          Please{" "}
          <Link href="/login" className="text-brand underline">
            log in
          </Link>{" "}
          as an admin to add fixtures.
        </p>
      </main>
    );
  }

  if (!user.isAdmin) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-800">Fixtures admin</h1>
        <p className="mt-3 text-slate-600">This page is for admins only.</p>
      </main>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("fixtures")
    .select("id, home_team, away_team, competition, kickoff")
    .eq("is_manual", true)
    .order("kickoff", { ascending: true });

  const fixtures: ManualFixture[] = (data ?? []).map((f) => ({
    id: f.id,
    home_team: f.home_team,
    away_team: f.away_team,
    competition: f.competition,
    kickoff: f.kickoff,
  }));

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-800">Add a fixture</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Premier League fixtures and results load automatically every day. Use
        this page to add games the feed doesn&apos;t cover — mainly pre-season
        friendlies. Anything you add here shows up in the &ldquo;Next up&rdquo;
        banner and fixtures list.
      </p>

      <div className="mt-6">
        <FixturesAdmin fixtures={fixtures} />
      </div>
    </main>
  );
}
