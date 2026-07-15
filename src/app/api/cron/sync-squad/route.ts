/**
 * Scheduled job: refresh Chelsea's squad list from API-Football into Supabase.
 * Runs rarely (squads only change in transfer windows) to respect the
 * 100 requests/day free-tier limit — this uses a single call.
 *
 * Market values are NOT touched here — those stay hand-maintained in
 * data/market-values.json. We only sync names / positions / shirt numbers.
 *
 * Not on the daily schedule (Vercel's free plan allows only 2 cron jobs, used
 * for fixtures + lineups). Squads only change in transfer windows, so the owner
 * triggers this by hand when needed: visit /api/cron/sync-squad?key=CRON_SECRET.
 * Protected by CRON_SECRET.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { cronAuthorized, logApiCall } from "@/lib/cron";

export const dynamic = "force-dynamic";

const AF_BASE = "https://v3.football.api-sports.io";
const CHELSEA_ID = 49; // API-Football team id

// API-Football uses long position names; map them to our GK/DEF/MID/FWD.
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

  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    return NextResponse.json({ ok: false, error: "Missing API key" }, { status: 500 });
  }

  const admin = createAdminClient();

  try {
    const res = await fetch(`${AF_BASE}/players/squads?team=${CHELSEA_ID}`, {
      headers: { "x-apisports-key": key },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const players: SquadPlayer[] = data.response?.[0]?.players ?? [];

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
    }

    await logApiCall(admin, "api-football", "players/squads", "ok", `${rows.length} players`);
    return NextResponse.json({ ok: true, players: rows.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    await logApiCall(admin, "api-football", "players/squads", "error", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

type SquadPlayer = {
  id: number;
  name: string;
  number: number | null;
  position: string;
};
