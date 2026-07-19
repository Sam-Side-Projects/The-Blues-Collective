// =============================================================
// The Blues Collective — one-time squad migration
// -------------------------------------------------------------
// WHAT THIS DOES (plain English):
//   1. Pulls Chelsea's CURRENT squad from API-Football (the same feed the
//      daily sync uses) and writes it into the "squad_players" table.
//   2. Carries over your hand-typed market values from
//      data/market-values.json onto the matching players (matched by name),
//      so nobody shows as €0 straight away. (Phase 4 replaces these with
//      fan-proposed fees.)
//   3. Marks anyone who's left the club as inactive, so they drop out of
//      the lineup builder and Transfer Centre.
//   4. Deletes the old hand-seeded squad rows (the ones with no API id) and
//      the old placeholder fixtures, so the database holds real data only.
//
// SAFE TO RE-RUN: it matches by API id, so re-running never duplicates.
//
// HOW TO RUN IT:
//   node scripts/migrate-squad.mjs
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
const AF_CHELSEA_ID = 49;
const POSITION_MAP = {
  Goalkeeper: "GK",
  Defender: "DEF",
  Midfielder: "MID",
  Attacker: "FWD",
};

// Normalise a name so "Benoît Badiashile" matches "Benoit Badiashile".
const norm = (s) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// ---- 0. Hand market values ----
// The feed abbreviates first names ("C. Palmer"), so a full-name match misses
// almost everyone. We key values two ways: by full normalised name, and by
// "surname + position" (e.g. "palmer|MID"), which matches "C. Palmer" too.
// Surname is the last word of the name.
const mv = JSON.parse(
  readFileSync(new URL("../data/market-values.json", import.meta.url), "utf8")
);
const surname = (s) => norm(s).split(" ").pop() ?? "";
const handValue = new Map(); // full normalised name -> value
const handValueBySurname = new Map(); // "surname|POS" -> value
for (const p of mv.squad ?? []) {
  handValue.set(norm(p.name), p.value);
  handValueBySurname.set(`${surname(p.name)}|${p.position}`, p.value);
}
const lookupValue = (name, pos) =>
  handValue.get(norm(name)) ??
  handValueBySurname.get(`${surname(name)}|${pos}`) ??
  null;

// ---- 1. Fetch the current Chelsea squad ----
if (!AF_KEY) {
  console.log("Missing API_FOOTBALL_KEY in .env.local — cannot continue.");
  process.exit(1);
}

const res = await fetch(
  `https://v3.football.api-sports.io/players/squads?team=${AF_CHELSEA_ID}`,
  { headers: { "x-apisports-key": AF_KEY } }
);
if (!res.ok) {
  console.log(`API-Football request failed: HTTP ${res.status}`);
  process.exit(1);
}
const data = await res.json();
const players = data.response?.[0]?.players ?? [];
if (players.length === 0) {
  console.log("API-Football returned no players — aborting to avoid wiping the squad.");
  process.exit(1);
}

// ---- 2. Upsert the real squad, carrying hand values by name ----
const rows = players.map((p) => {
  const position = POSITION_MAP[p.position] ?? "MID";
  return {
    api_id: p.id,
    name: p.name,
    position,
    shirt_number: p.number ?? null,
    market_value: lookupValue(p.name, position),
    is_active: true,
    updated_at: new Date().toISOString(),
  };
});

const { error: upErr } = await supabase
  .from("squad_players")
  .upsert(rows, { onConflict: "api_id" });
if (upErr) {
  console.log("Error writing squad:", upErr.message);
  process.exit(1);
}

const matched = rows.filter((r) => r.market_value != null).length;

// ---- 3. Deactivate anyone no longer in the squad ----
const currentIds = rows.map((r) => r.api_id);
const { error: deactErr } = await supabase
  .from("squad_players")
  .update({ is_active: false, updated_at: new Date().toISOString() })
  .not("api_id", "is", null)
  .not("api_id", "in", `(${currentIds.join(",")})`);
if (deactErr) console.log("Warning — could not deactivate departed players:", deactErr.message);

// ---- 4a. Delete the old hand-seeded squad rows (no API id) ----
const { error: delSquadErr, count: delSquad } = await supabase
  .from("squad_players")
  .delete({ count: "exact" })
  .is("api_id", null);
if (delSquadErr) console.log("Warning — could not delete seeded squad rows:", delSquadErr.message);

// ---- 4b. Delete old placeholder fixtures (negative id, not hand-added) ----
const { error: delFixErr, count: delFix } = await supabase
  .from("fixtures")
  .delete({ count: "exact" })
  .lt("id", 0)
  .not("is_manual", "is", true);
if (delFixErr) console.log("Warning — could not delete placeholder fixtures:", delFixErr.message);

console.log("=====================================================");
console.log(`  Synced ${rows.length} current Chelsea player(s).`);
console.log(`  Carried hand market values onto ${matched} of them.`);
console.log(`  Removed ${delSquad ?? 0} old seeded squad row(s).`);
console.log(`  Removed ${delFix ?? 0} placeholder fixture(s).`);
console.log("  Real Premier League fixtures load on the next daily sync.");
console.log("=====================================================");
