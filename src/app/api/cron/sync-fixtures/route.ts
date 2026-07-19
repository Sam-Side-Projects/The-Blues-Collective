/**
 * Scheduled job: pull Chelsea's fixtures + results and the Premier League table
 * from football-data.org into Supabase. Pages read only from our DB, never from
 * this API directly. Free tier is ~10 requests/min, so this makes just 2 calls.
 *
 * Trigger: Vercel Cron (see vercel.json). Protected by CRON_SECRET.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { cronAuthorized, logApiCall, todaysCallCount } from "@/lib/cron";

export const dynamic = "force-dynamic";

const FD_BASE = "https://api.football-data.org/v4";
const CHELSEA_ID = 61; // football-data.org team id
const PL_COMP = 2021; // Premier League competition id

// API-Football (squad refresh) — different service, different id for Chelsea.
const AF_BASE = "https://v3.football.api-sports.io";
const AF_CHELSEA_ID = 49;
const AF_DAILY_BUDGET = 90; // free tier is 100/day; stay clear of the ceiling
const POSITION_MAP: Record<string, string> = {
  Goalkeeper: "GK",
  Defender: "DEF",
  Midfielder: "MID",
  Attacker: "FWD",
};

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
  const result = { fixtures: 0, standings: 0, squad: 0, errors: [] as string[] };

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
        competition: "Premier League",
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

    // Preseason guard: before the season starts, football-data returns every
    // team at position 1 with 0 games played. That's not a real table — storing
    // it is meaningless and the duplicate positions crash the upsert. Skip until
    // at least one game has been played.
    const seasonStarted = entries.some((r) => (r.playedGames ?? 0) > 0);
    if (!seasonStarted) {
      await logApiCall(
        admin,
        "football-data",
        "competitions/2021/standings",
        "skipped",
        "season not started — no table yet"
      );
    } else {
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
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    result.errors.push(`standings: ${msg}`);
    await logApiCall(admin, "football-data", "competitions/2021/standings", "error", msg);
  }

  // ---------- 3. Chelsea squad (API-Football) ----------
  // Folded into this daily job so we don't need a third Vercel cron. The squad
  // endpoint isn't season-locked on the free tier, so it works for the current
  // season (unlike API-Football fixtures). One request; guarded by the daily
  // budget so we never blow past the 100/day free-tier ceiling.
  try {
    const afKey = process.env.API_FOOTBALL_KEY;
    if (!afKey) throw new Error("Missing API_FOOTBALL_KEY");

    const used = await todaysCallCount(admin, "api-football");
    if (used >= AF_DAILY_BUDGET) {
      await logApiCall(admin, "api-football", "players/squads", "skipped", `daily budget reached (${used})`);
    } else {
      const res = await fetch(`${AF_BASE}/players/squads?team=${AF_CHELSEA_ID}`, {
        headers: { "x-apisports-key": afKey },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const players: SquadApiPlayer[] = data.response?.[0]?.players ?? [];

      const rows = players.map((p) => ({
        api_id: p.id,
        name: p.name,
        position: POSITION_MAP[p.position] ?? "MID",
        shirt_number: p.number ?? null,
        is_active: true,
        updated_at: new Date().toISOString(),
      }));

      if (rows.length > 0) {
        const { error } = await admin.from("squad_players").upsert(rows, { onConflict: "api_id" });
        if (error) throw new Error(error.message);

        // Anyone previously synced but missing from today's squad has left the
        // club — mark them inactive so they drop out of the lineup builder and
        // transfer centre (they're never passed off as current).
        const currentIds = rows.map((r) => r.api_id);
        await admin
          .from("squad_players")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .not("api_id", "is", null)
          .not("api_id", "in", `(${currentIds.join(",")})`);
      }
      result.squad = rows.length;
      await logApiCall(admin, "api-football", "players/squads", "ok", `${rows.length} players`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    result.errors.push(`squad: ${msg}`);
    await logApiCall(admin, "api-football", "players/squads", "error", msg);
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

type SquadApiPlayer = {
  id: number;
  name: string;
  number: number | null;
  position: string;
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
