// =============================================================
// The Blues Collective — founder-set squad values
// -------------------------------------------------------------
// WHAT THIS DOES (plain English):
//   Sets each Chelsea player's transfer value to the number the founder chose.
//   Players who aren't in the live feed (loanees, new signings it hasn't picked
//   up) are added BY HAND: they get no API id, which means the daily sync
//   leaves them alone forever (it only ever deactivates feed players).
//
//   Values are in €m and are the founder's own figures — not scraped, not real
//   valuations. Edit the list below and re-run to change them.
//
//   SAFE TO RE-RUN: matches on API id / name, never duplicates.
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

// Founder-set values in €m, keyed by API-Football player id.
const VALUES_BY_API_ID = {
  // Goalkeepers
  18959: 22, // Robert Sánchez
  286616: 16, // Filip Jørgensen
  64167: 3, // Gabriel Słonina
  180940: 0.5, // Teddy Sharman-Lowe
  // Defenders
  152953: 65, // Levi Colwill
  19720: 40, // Trevoh Chalobah
  341642: 40, // Jorrel Hato
  383018: 36, // Marco Palestra
  19545: 60, // Reece James
  161907: 35, // Malo Gusto
  22094: 28, // Wesley Fofana
  366735: 26, // Josh Acheampong
  276184: 22, // Mamadou Sarr
  95: 17, // Benoît Badiashile
  19145: 16, // Tosin Adarabioyo
  // Midfielders
  152982: 105, // Cole Palmer
  116117: 100, // Moisés Caicedo
  5996: 90, // Enzo Fernández
  282125: 24, // Romeo Lavia
  308678: 16, // Dário Essugo
  392270: 12, // Marc Guiu
  // Forwards
  10329: 78, // João Pedro
  425733: 76, // Estêvão
  1864: 60, // Pedro Neto
  419582: 43, // Geovany Quenda
  284324: 39, // Alejandro Garnacho
  286894: 34, // Jamie Bynoe-Gittens
  203762: 29, // Emmanuel Emegha
  161948: 28, // Liam Delap
};

// Players the live feed doesn't list — added by hand (no API id).
const HAND_ADDED = [
  { name: "Nicolas Jackson", position: "FWD", shirt_number: 15, market_value: 41 },
  { name: "Mike Penders", position: "GK", shirt_number: null, market_value: 25 },
  { name: "Aaron Anselmino", position: "DEF", shirt_number: null, market_value: 12 },
  { name: "Caleb Wiley", position: "DEF", shirt_number: null, market_value: 8 },
  { name: "Dastan Setpaev", position: "FWD", shirt_number: null, market_value: 3 },
  { name: "Morgan Rogers", position: "MID", shirt_number: null, market_value: 90 },
];

// Players the feed still lists as ours but who have actually left. Hiding them
// sticks, because the daily sync never touches the is_hidden column.
const HIDDEN = ["Andrey Santos"];

// ---- 1. Apply the founder's values to players from the feed ----
let updated = 0;
for (const [apiId, value] of Object.entries(VALUES_BY_API_ID)) {
  const { error, count } = await supabase
    .from("squad_players")
    .update({ market_value: value, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("api_id", Number(apiId));
  if (error) console.log(`  error on api_id ${apiId}: ${error.message}`);
  else if (count === 0) console.log(`  !! no player found for api_id ${apiId}`);
  else updated += count;
}
console.log(`Updated ${updated} player(s) from the feed.`);

// ---- 2. Add / update the hand-added players ----
for (const p of HAND_ADDED) {
  const { data: existing } = await supabase
    .from("squad_players")
    .select("id")
    .ilike("name", p.name)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("squad_players")
      .update({
        market_value: p.market_value,
        position: p.position,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    console.log(`  updated ${p.name} -> €${p.market_value}m`);
  } else {
    const { error } = await supabase.from("squad_players").insert({
      api_id: null, // hand-added: the daily sync never touches these
      name: p.name,
      position: p.position,
      shirt_number: p.shirt_number,
      market_value: p.market_value,
      is_active: true,
      updated_at: new Date().toISOString(),
    });
    if (error) console.log(`  error adding ${p.name}: ${error.message}`);
    else console.log(`  added ${p.name} (${p.position}) -> €${p.market_value}m`);
  }
}

// ---- 3. Hide players who've actually left ----
for (const name of HIDDEN) {
  const { error, count } = await supabase
    .from("squad_players")
    .update({ is_hidden: true, updated_at: new Date().toISOString() }, { count: "exact" })
    .ilike("name", `%${name}%`);
  if (error) console.log(`  could not hide ${name}: ${error.message}`);
  else console.log(`  hid ${count} row(s) matching "${name}"`);
}

// ---- 4. Report anyone still without a founder-set value ----
const { data: after } = await supabase
  .from("squad_players")
  .select("name, position, market_value")
  .eq("is_active", true)
  .eq("is_hidden", false)
  .order("market_value", { ascending: false });

const zero = (after ?? []).filter((p) => p.market_value == null || Number(p.market_value) <= 0);

console.log("=====================================================");
console.log(`  ${after?.length ?? 0} active player(s); ${zero.length} with no value.`);
console.log("=====================================================");
