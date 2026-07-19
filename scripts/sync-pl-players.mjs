// =============================================================
// The Blues Collective — populate the Premier League player pool
// -------------------------------------------------------------
// WHAT THIS DOES (plain English):
//   Fills the "pl_players" table with the current squads of the 20 clubs, so
//   the Transfer Centre search has players to find. Club ids come from
//   API-Football's standings (reliable ids); the squads themselves are current.
//
//   It waits ~7 seconds between calls because the free plan allows only ~10
//   requests a minute — so this takes a couple of minutes to finish. That's
//   normal. After this, the daily sync job keeps the pool fresh automatically.
//
//   No market values — transfer fees are proposed by fans in the app.
//
// HOW TO RUN IT:
//   node scripts/sync-pl-players.mjs
// =============================================================

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) =>
  env.split("\n").find((l) => l.startsWith(k + "="))?.slice(k.length + 1).trim();

const supabase = createClient(
  get("NEXT_PUBLIC_SUPABASE_URL"),
  get("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } }
);

const AF_KEY = get("API_FOOTBALL_KEY");
const AF_BASE = "https://v3.football.api-sports.io";
const PL_COMP = 39;
const SEASON = 2024; // newest season the free tier allows; squads returned are current
const POSITION_MAP = {
  Goalkeeper: "GK",
  Defender: "DEF",
  Midfielder: "MID",
  Attacker: "FWD",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!AF_KEY) {
  console.log("Missing API_FOOTBALL_KEY in .env.local.");
  process.exit(1);
}

// ---- 1. Get the 20 club ids from standings ----
const sRes = await fetch(`${AF_BASE}/standings?league=${PL_COMP}&season=${SEASON}`, {
  headers: { "x-apisports-key": AF_KEY },
});
const sData = await sRes.json();
const rows = sData.response?.[0]?.league?.standings?.[0] ?? [];
const teams = rows.map((r) => ({ team_id: r.team.id, name: r.team.name }));
if (teams.length === 0) {
  console.log("Could not read the club list from standings. Errors:", JSON.stringify(sData.errors));
  process.exit(1);
}
console.log(`Found ${teams.length} clubs. Refreshing pl_teams…`);

// Reset the club cache (clears any junk from earlier runs), then store the 20.
await supabase.from("pl_teams").delete().neq("team_id", 0);
await supabase.from("pl_teams").upsert(
  teams.map((t) => ({ ...t, updated_at: new Date().toISOString() })),
  { onConflict: "team_id" }
);

// ---- 2. Pull each club's current squad (throttled) ----
const seen = [];
let total = 0;
for (const t of teams) {
  await sleep(7000); // stay under ~10 requests/minute
  const r = await fetch(`${AF_BASE}/players/squads?team=${t.team_id}`, {
    headers: { "x-apisports-key": AF_KEY },
  });
  const j = await r.json();
  const players = j.response?.[0]?.players ?? [];
  const prows = players.map((p) => ({
    api_id: p.id,
    name: p.name,
    age: p.age ?? null,
    position: POSITION_MAP[p.position] ?? "MID",
    club: t.name,
    team_id: t.team_id,
    is_active: true,
    updated_at: new Date().toISOString(),
  }));
  if (prows.length) {
    const { error } = await supabase.from("pl_players").upsert(prows, { onConflict: "api_id" });
    if (error) console.log(`  error saving ${t.name}: ${error.message}`);
    else {
      for (const row of prows) seen.push(row.api_id);
      total += prows.length;
    }
  }
  console.log(`  ${t.name}: ${prows.length} players`);
}

// ---- 3. Deactivate anyone not seen (guard against a partial run) ----
if (seen.length > 100) {
  await supabase
    .from("pl_players")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .not("api_id", "in", `(${seen.join(",")})`);
}

console.log("=====================================================");
console.log(`  Stored ${total} player(s) across ${teams.length} clubs.`);
console.log("  The Transfer Centre search is now populated.");
console.log("=====================================================");
