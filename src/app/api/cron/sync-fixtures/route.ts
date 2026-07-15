/**
 * Scheduled job: pull Chelsea's fixtures + results and the Premier League table
 * from football-data.org into Supabase. Pages read only from our DB, never from
 * this API directly. Free tier is ~10 requests/min, so this makes just 2 calls.
 *
 * Trigger: Vercel Cron (see vercel.json). Protected by CRON_SECRET.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { cronAuthorized, logApiCall } from "@/lib/cron";

export const dynamic = "force-dynamic";

const FD_BASE = "https://api.football-data.org/v4";
const CHELSEA_ID = 61; // football-data.org team id
const PL_COMP = 2021; // Premier League competition id

export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.FOOTBALL_DATA_API_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing API token" }, { status: 500 });
  }

  const admin = createAdminClient();
  const headers = { "X-Auth-Token": token };
  const result = { fixtures: 0, standings: 0, errors: [] as string[] };

  // ---------- 1. Chelsea matches (fixtures + results) ----------
  try {
    const res = await fetch(`${FD_BASE}/teams/${CHELSEA_ID}/matches?competitions=${PL_COMP}`, {
      headers,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const matches: MatchRow[] = data.matches ?? [];

    const rows = matches.map((m) => {
      const chelseaHome = m.homeTeam?.id === CHELSEA_ID;
      return {
        id: m.id,
        season: String(m.season?.startDate?.slice(0, 4) ?? ""),
        matchday: m.matchday ?? null,
        home_team: m.homeTeam?.name ?? "TBC",
        away_team: m.awayTeam?.name ?? "TBC",
        chelsea_home: chelseaHome,
        opponent: chelseaHome ? m.awayTeam?.name : m.homeTeam?.name,
        kickoff: m.utcDate,
        status: m.status ?? "SCHEDULED",
        home_score: m.score?.fullTime?.home ?? null,
        away_score: m.score?.fullTime?.away ?? null,
        updated_at: new Date().toISOString(),
      };
    });

    if (rows.length > 0) {
      const { error } = await admin.from("fixtures").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(error.message);
    }
    result.fixtures = rows.length;
    await logApiCall(admin, "football-data", "teams/61/matches", "ok", `${rows.length} fixtures`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    result.errors.push(`fixtures: ${msg}`);
    await logApiCall(admin, "football-data", "teams/61/matches", "error", msg);
  }

  // ---------- 2. Premier League standings ----------
  try {
    const res = await fetch(`${FD_BASE}/competitions/${PL_COMP}/standings`, {
      headers,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const table = data.standings?.find((s: { type: string }) => s.type === "TOTAL");
    const entries: StandingRow[] = table?.table ?? [];

    // Dedupe by position: `position` is the primary key, so two rows sharing it
    // in one upsert batch would error ("cannot affect row a second time").
    const byPosition = new Map<number, Record<string, unknown>>();
    for (const r of entries) {
      if (r.position == null) continue;
      byPosition.set(r.position, {
        position: r.position,
        team: r.team?.name ?? "TBC",
        played: r.playedGames ?? 0,
        won: r.won ?? 0,
        drawn: r.draw ?? 0,
        lost: r.lost ?? 0,
        goals_for: r.goalsFor ?? 0,
        goals_against: r.goalsAgainst ?? 0,
        goal_diff: r.goalDifference ?? 0,
        points: r.points ?? 0,
        updated_at: new Date().toISOString(),
      });
    }
    const rows = [...byPosition.values()];

    if (rows.length > 0) {
      const { error } = await admin.from("league_table").upsert(rows, { onConflict: "position" });
      if (error) throw new Error(error.message);
    }
    result.standings = rows.length;
    await logApiCall(admin, "football-data", "competitions/2021/standings", "ok", `${rows.length} rows`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    result.errors.push(`standings: ${msg}`);
    await logApiCall(admin, "football-data", "competitions/2021/standings", "error", msg);
  }

  return NextResponse.json({ ok: result.errors.length === 0, ...result });
}

type MatchRow = {
  id: number;
  matchday: number | null;
  utcDate: string;
  status: string;
  season?: { startDate?: string };
  homeTeam?: { id: number; name: string };
  awayTeam?: { id: number; name: string };
  score?: { fullTime?: { home: number | null; away: number | null } };
};

type StandingRow = {
  position: number;
  team?: { name: string };
  playedGames?: number;
  won?: number;
  draw?: number;
  lost?: number;
  goalsFor?: number;
  goalsAgainst?: number;
  goalDifference?: number;
  points?: number;
};
