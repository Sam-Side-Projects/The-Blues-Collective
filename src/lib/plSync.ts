/**
 * Keep the `pl_players` search pool (used by the Transfer Centre) fresh.
 *
 * Data source (all free tier):
 *   - The 20 club ids come from API-Football's own standings. Its free tier
 *     only allows finished seasons (up to PL_TEAMS_SEASON), but club ids are
 *     stable, and `/players/squads` returns each club's CURRENT squad — so we
 *     get today's players even though the club list is pinned to a past season.
 *     (This is more reliable than name-search, which returns only youth sides
 *     for some clubs.)
 *   - `/players/squads` gives each player's name, age and position.
 *
 * Free-tier limits shape the design:
 *   - 10 requests/MINUTE — so a cron refreshes only a few clubs per run.
 *   - Vercel cron can't sleep for minutes — so we never batch all 20 at once
 *     on the server; we rotate a slice per day and cover them all across ~5
 *     days ("roughly weekly", as intended).
 *
 * There is NO market value here — fees are proposed by fans in the app.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiCall, todaysCallCount } from "./cron";

const AF_BASE = "https://v3.football.api-sports.io";
const AF_DAILY_BUDGET = 90; // free tier is 100/day; leave headroom
const PL_COMP_AF = 39; // API-Football Premier League id
const PL_TEAMS_SEASON = 2024; // newest season the free tier allows; bump if extended
const TEAMS_PER_RUN = 4; // clubs refreshed per daily run (keeps us under 10/min)

const POSITION_MAP: Record<string, string> = {
  Goalkeeper: "GK",
  Defender: "DEF",
  Midfielder: "MID",
  Attacker: "FWD",
};

type AfStandingRow = { team: { id: number; name: string } };
type AfSquadPlayer = {
  id: number;
  name: string;
  age: number | null;
  number: number | null;
  position: string;
};

export type PlSyncResult = { teams: number; players: number; errors: string[] };

/** Make sure pl_teams holds the 20 club ids; fetch them once if it's empty. */
async function ensureTeams(
  admin: SupabaseClient,
  afKey: string
): Promise<{ team_id: number; name: string }[]> {
  const { data: cached } = await admin.from("pl_teams").select("team_id, name");
  if (cached && cached.length >= 20) return cached;

  const res = await fetch(
    `${AF_BASE}/standings?league=${PL_COMP_AF}&season=${PL_TEAMS_SEASON}`,
    { headers: { "x-apisports-key": afKey }, cache: "no-store" }
  );
  if (!res.ok) throw new Error(`standings HTTP ${res.status}`);
  const data = await res.json();
  const rows: AfStandingRow[] = data.response?.[0]?.league?.standings?.[0] ?? [];
  const teams = rows.map((r) => ({ team_id: r.team.id, name: r.team.name }));
  if (teams.length > 0) {
    await admin.from("pl_teams").upsert(
      teams.map((t) => ({ ...t, updated_at: new Date().toISOString() })),
      { onConflict: "team_id" }
    );
    await logApiCall(admin, "api-football", "standings", "ok", `${teams.length} clubs`);
  }
  return teams;
}

/** Refresh one club's squad; deactivate its players who've left. */
async function refreshTeam(
  admin: SupabaseClient,
  afKey: string,
  team: { team_id: number; name: string }
): Promise<number> {
  const res = await fetch(`${AF_BASE}/players/squads?team=${team.team_id}`, {
    headers: { "x-apisports-key": afKey },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const players: AfSquadPlayer[] = data.response?.[0]?.players ?? [];

  const rows = players.map((p) => ({
    api_id: p.id,
    name: p.name,
    age: p.age ?? null,
    position: POSITION_MAP[p.position] ?? "MID",
    club: team.name,
    team_id: team.team_id,
    is_active: true,
    updated_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    const { error } = await admin.from("pl_players").upsert(rows, { onConflict: "api_id" });
    if (error) throw new Error(error.message);
    // Anyone previously at this club but missing now has moved on.
    const seen = rows.map((r) => r.api_id);
    await admin
      .from("pl_players")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("team_id", team.team_id)
      .not("api_id", "in", `(${seen.join(",")})`);
  }
  return rows.length;
}

/**
 * Daily cron entry point: refresh today's slice of clubs (a few at a time).
 * Over ~5 days every club is covered, staying under the per-minute cap and
 * within Vercel's function time limit.
 */
export async function syncPremierLeaguePlayersSlice(
  admin: SupabaseClient
): Promise<PlSyncResult> {
  const result: PlSyncResult = { teams: 0, players: 0, errors: [] };
  const afKey = process.env.API_FOOTBALL_KEY;
  if (!afKey) {
    result.errors.push("Missing API_FOOTBALL_KEY");
    return result;
  }

  let teams: { team_id: number; name: string }[];
  try {
    teams = await ensureTeams(admin, afKey);
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : "teams unknown");
    return result;
  }
  if (teams.length === 0) {
    result.errors.push("no PL clubs available");
    return result;
  }

  // Rotate a slice by day so every club is refreshed across the week.
  teams.sort((a, b) => a.team_id - b.team_id);
  const groups = Math.ceil(teams.length / TEAMS_PER_RUN);
  const dayOfYear = Math.floor(
    (Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86400000
  );
  const group = dayOfYear % groups;
  const slice = teams.slice(group * TEAMS_PER_RUN, group * TEAMS_PER_RUN + TEAMS_PER_RUN);

  let used = await todaysCallCount(admin, "api-football");
  for (const t of slice) {
    if (used >= AF_DAILY_BUDGET) {
      await logApiCall(admin, "api-football", "players/squads", "skipped", `budget reached (${used})`);
      break;
    }
    try {
      const n = await refreshTeam(admin, afKey, t);
      used++;
      result.teams++;
      result.players += n;
      await logApiCall(admin, "api-football", "players/squads", "ok", `${t.name}: ${n}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      result.errors.push(`squad ${t.name}: ${msg}`);
      await logApiCall(admin, "api-football", "players/squads", "error", `${t.name}: ${msg}`);
    }
  }
  return result;
}
