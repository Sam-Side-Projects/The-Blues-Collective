// =============================================================
// The Blues Collective — seed the 95-Point Game roster into Supabase
// -------------------------------------------------------------
// WHAT THIS DOES (plain English):
//   Copies every player from data/blues-legends.json into the
//   "blues_legends" database table, and fills "game_seasons" with the
//   full list of Chelsea seasons that appear in the roster (so the wheel
//   has something to spin on).
//
//   It MERGES safely: it matches players by their Wikidata id (or name
//   for manually added ones) and updates them, so re-running never makes
//   duplicates. The database is the live source of truth once seeded;
//   the JSON file stays as a backup/seed you can re-import any time.
//
// HOW TO RUN IT:
//   node scripts/seed-blues-legends.mjs
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

const data = JSON.parse(
  readFileSync(new URL("../data/blues-legends.json", import.meta.url), "utf8")
);
const players = data.players ?? [];

// ---- 1. Upsert players ----
// Rows with a wikidataId use it as the conflict key; manual rows without
// one are matched by name so re-runs still merge cleanly.
const rows = players.map((p) => ({
  wikidata_id: p.wikidataId ?? null,
  name: p.name,
  seasons: p.seasons ?? [],
  slots: p.slots ?? [],
  price_m: p.priceM ?? null,
  attack: p.attack ?? null,
  defence: p.defence ?? null,
  excluded: p.excluded ?? false,
  note: p.note ?? null,
}));

const withId = rows.filter((r) => r.wikidata_id);
const withoutId = rows.filter((r) => !r.wikidata_id);

let upserted = 0;

// Players that have a Wikidata id: upsert on that unique column.
if (withId.length) {
  const { error, count } = await supabase
    .from("blues_legends")
    .upsert(withId, { onConflict: "wikidata_id", count: "exact" });
  if (error) {
    console.log("Error upserting players:", error.message);
    process.exit(1);
  }
  upserted += count ?? withId.length;
}

// Manual players (no Wikidata id): insert only if not already present by name.
for (const r of withoutId) {
  const { data: existing } = await supabase
    .from("blues_legends")
    .select("id")
    .eq("name", r.name)
    .is("wikidata_id", null)
    .maybeSingle();
  if (existing) {
    await supabase.from("blues_legends").update(r).eq("id", existing.id);
  } else {
    await supabase.from("blues_legends").insert(r);
  }
  upserted++;
}

// ---- 2. Fill game_seasons from every season in the roster ----
const seasonSet = new Set();
for (const p of players) for (const s of p.seasons ?? []) seasonSet.add(s);
const seasonRows = [...seasonSet].sort().map((season) => ({ season }));

if (seasonRows.length) {
  const { error } = await supabase
    .from("game_seasons")
    .upsert(seasonRows, { onConflict: "season" });
  if (error) {
    console.log("Error upserting seasons:", error.message);
    process.exit(1);
  }
}

console.log("=====================================================");
console.log(`  Seeded ${upserted} player(s) into blues_legends.`);
console.log(`  Registered ${seasonRows.length} season(s) in game_seasons.`);
console.log("  Re-run any time — it merges, never duplicates.");
console.log("=====================================================");
