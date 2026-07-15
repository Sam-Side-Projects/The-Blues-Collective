/**
 * Matchday job: once Chelsea's real starting XI is confirmed (about an hour
 * before kickoff), pull it from API-Football, store it as the confirmed lineup,
 * and score everyone's predictions for that fixture.
 *
 * The two football APIs use different fixture ids, so we bridge them by date:
 * we look at our own fixtures that are kicking off around now, ask API-Football
 * for Chelsea's fixture on that date, then fetch that fixture's lineup.
 *
 * Trigger: Vercel Cron, frequently on matchdays (see vercel.json).
 * Protected by CRON_SECRET.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { cronAuthorized, logApiCall } from "@/lib/cron";
import { scoreFixture } from "@/lib/scoreFixture";

export const dynamic = "force-dynamic";

const AF_BASE = "https://v3.football.api-sports.io";
const CHELSEA_ID = 49; // API-Football team id

export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    return NextResponse.json({ ok: false, error: "Missing API key" }, { status: 500 });
  }

  const admin = createAdminClient();
  const headers = { "x-apisports-key": key };

  // Our fixtures kicking off within the next 2h or started in the last 3h, and
  // that don't already have a confirmed lineup stored.
  const now = Date.now();
  const from = new Date(now - 3 * 60 * 60 * 1000).toISOString();
  const to = new Date(now + 2 * 60 * 60 * 1000).toISOString();

  const { data: fixtures } = await admin
    .from("fixtures")
    .select("id, kickoff, opponent")
    .gte("kickoff", from)
    .lte("kickoff", to)
    .order("kickoff", { ascending: true });

  if (!fixtures || fixtures.length === 0) {
    await logApiCall(admin, "api-football", "fixtures/lineups", "skipped", "no fixture in window");
    return NextResponse.json({ ok: true, scored: 0, note: "No fixture kicking off now." });
  }

  const outcomes: { fixture: number; result: string }[] = [];

  for (const fx of fixtures) {
    // Skip if we already stored this confirmed lineup.
    const { data: existing } = await admin
      .from("confirmed_lineups")
      .select("fixture_ref")
      .eq("fixture_ref", fx.id)
      .maybeSingle();
    if (existing) {
      outcomes.push({ fixture: fx.id, result: "already stored" });
      continue;
    }

    const date = fx.kickoff.slice(0, 10); // YYYY-MM-DD
    try {
      // Find API-Football's fixture id for Chelsea on that date.
      const fRes = await fetch(`${AF_BASE}/fixtures?team=${CHELSEA_ID}&date=${date}`, {
        headers,
        cache: "no-store",
      });
      if (!fRes.ok) throw new Error(`fixtures HTTP ${fRes.status}`);
      const fData = await fRes.json();
      const afFixtureId: number | undefined = fData.response?.[0]?.fixture?.id;
      await logApiCall(admin, "api-football", "fixtures", "ok", `date ${date}`);

      if (!afFixtureId) {
        outcomes.push({ fixture: fx.id, result: "no api-football match" });
        continue;
      }

      // Fetch the confirmed lineup for that fixture.
      const lRes = await fetch(`${AF_BASE}/fixtures/lineups?fixture=${afFixtureId}&team=${CHELSEA_ID}`, {
        headers,
        cache: "no-store",
      });
      if (!lRes.ok) throw new Error(`lineups HTTP ${lRes.status}`);
      const lData = await lRes.json();
      const lineup = lData.response?.[0];
      await logApiCall(admin, "api-football", "fixtures/lineups", "ok", `fixture ${afFixtureId}`);

      const starters: StartXI[] = lineup?.startXI ?? [];
      if (starters.length === 0) {
        outcomes.push({ fixture: fx.id, result: "lineup not confirmed yet" });
        continue;
      }

      const starterRows = starters.map((s) => ({
        player_id: s.player?.id ?? null,
        player_name: s.player?.name ?? "",
        position: s.player?.pos ?? null,
      }));

      await admin.from("confirmed_lineups").upsert(
        {
          fixture_ref: fx.id,
          formation: lineup?.formation ?? null,
          starters: starterRows,
          created_at: new Date().toISOString(),
        },
        { onConflict: "fixture_ref" }
      );

      // Score all predictions for this fixture.
      const scored = await scoreFixture(admin, fx.id);
      outcomes.push({ fixture: fx.id, result: scored.message });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      await logApiCall(admin, "api-football", "fixtures/lineups", "error", msg);
      outcomes.push({ fixture: fx.id, result: `error: ${msg}` });
    }
  }

  return NextResponse.json({ ok: true, outcomes });
}

type StartXI = {
  player?: { id: number; name: string; pos: string };
};
