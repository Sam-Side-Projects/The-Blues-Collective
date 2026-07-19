// =============================================================
// The Blues Collective — squad values + hand-added players
// -------------------------------------------------------------
// WHAT THIS DOES (plain English):
//   1. Adds Nicolas Jackson to the squad as a striker (FWD). The live feed
//      doesn't list him, so he's added BY HAND: he has no API id, which means
//      the daily sync leaves him completely alone (it only ever deactivates
//      players that came from the feed).
//   2. Gives every squad player a transfer value, so nobody shows as €0.
//      Values already set by hand are left untouched.
//   3. Safety net: anyone still without a value gets a small floor value.
//
//   These are COMMUNITY ESTIMATES in €m — invented starting points, not real
//   valuations. Edit them here (or in the database) any time.
//
//   SAFE TO RE-RUN: it won't duplicate Jackson and won't overwrite values.
//
// HOW TO RUN IT:
//   node scripts/set-squad-values.mjs
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

const FLOOR = 2; // nobody is ever worth €0

// Estimated values (€m) keyed by API-Football player id, for players the
// migration couldn't match to an old hand-typed value.
const VALUES_BY_API_ID = {
  // Defenders
  276184: 20, // M. Sarr
  341642: 45, // J. Hato
  19720: 30, // T. Chalobah
  609590: 5, // Denner
  383018: 8, // M. Palestra
  // Forwards
  161948: 40, // L. Delap
  203762: 35, // E. Emegha
  286894: 45, // J. Bynoe-Gittens
  10329: 55, // João Pedro
  425733: 70, // Estêvão
  284324: 45, // A. Garnacho
  359117: 8, // Shumaira Mheuka
  419582: 40, // Geovany Quenda
  // Goalkeepers
  287868: 2, // Max Merrick
  180940: 2, // T. Sharman-Lowe
  64167: 8, // G. Słonina
  // Midfielders
  454935: 2, // L. Emenalo
  482888: 3, // R. Walsh
  308678: 20, // Dário Essugo
  305834: 30, // Andrey Santos
  568066: 2, // M. Eboue
  610563: 2, // C. Holland
  557379: 2, // R. Kavuma McQueen
};

// ---- 1. Add Nicolas Jackson by hand (no API id => sync never touches him) ----
const { data: existing } = await supabase
  .from("squad_players")
  .select("id, is_active")
  .ilike("name", "%Nicolas Jackson%")
  .maybeSingle();

if (existing) {
  await supabase
    .from("squad_players")
    .update({ is_active: true, position: "FWD", updated_at: new Date().toISOString() })
    .eq("id", existing.id);
  console.log("Nicolas Jackson already present — made sure he's active as FWD.");
} else {
  const { error } = await supabase.from("squad_players").insert({
    api_id: null, // hand-added: the daily sync only deactivates feed players
    name: "Nicolas Jackson",
    position: "FWD",
    shirt_number: 15,
    market_value: 55,
    is_active: true,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.log("Could not add Nicolas Jackson:", error.message);
    process.exit(1);
  }
  console.log("Added Nicolas Jackson (FWD, #15, €55m).");
}

// ---- 2. Fill in the estimated values ----
let set = 0;
for (const [apiId, value] of Object.entries(VALUES_BY_API_ID)) {
  const { error } = await supabase
    .from("squad_players")
    .update({ market_value: value, updated_at: new Date().toISOString() })
    .eq("api_id", Number(apiId))
    .is("market_value", null); // never overwrite a value already set
  if (!error) set++;
}
console.log(`Applied estimated values to up to ${set} player(s).`);

// ---- 3. Safety net: nobody left at €0 or blank ----
const { data: active } = await supabase
  .from("squad_players")
  .select("id, name, market_value")
  .eq("is_active", true);

const needsFloor = (active ?? []).filter(
  (p) => p.market_value == null || Number(p.market_value) <= 0
);
for (const p of needsFloor) {
  await supabase
    .from("squad_players")
    .update({ market_value: FLOOR, updated_at: new Date().toISOString() })
    .eq("id", p.id);
  console.log(`  floor €${FLOOR}m -> ${p.name}`);
}

const { data: after } = await supabase
  .from("squad_players")
  .select("name, market_value")
  .eq("is_active", true);
const zero = (after ?? []).filter((p) => p.market_value == null || Number(p.market_value) <= 0);

console.log("=====================================================");
console.log(`  ${after?.length ?? 0} active player(s); ${zero.length} still without a value.`);
console.log("  Values are community estimates in €m, not real valuations.");
console.log("=====================================================");
