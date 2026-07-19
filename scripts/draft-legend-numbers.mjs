// =============================================================
// The Blues Collective — draft placeholder game numbers
// -------------------------------------------------------------
// WHAT THIS DOES (plain English):
//   Fills in a STARTING price, attack rating and defence rating for every
//   player in data/blues-legends.json that doesn't already have them, so the
//   95-Point Game is immediately playable. These are game-balance guesses,
//   NOT real valuations — you will tune them all in the admin page.
//
//   It ONLY fills blanks. Any number you've already set (or will set) is left
//   completely alone, so it's safe to run again after the import adds players.
//
// HOW THE STARTING NUMBERS ARE CHOSEN (all yours to change):
//   1. Each SLOT has a rough attack/defence shape at a "solid" level:
//        GK  — low attack, high defence
//        CB  — low attack, high defence
//        CM  — balanced
//        AM  — high attack, low defence
//        ST  — highest attack, lowest defence
//      A player in several slots gets the average of those shapes.
//   2. Each player gets a TIER (elite / star / solid / squad / filler) that
//      shifts those ratings up or down and sets the price. Famous names are
//      hand-listed as elite/star below; everyone else is tiered by how many
//      seasons they spent at the club (longer service = higher default).
//   3. Prices are set so a £500m budget buys roughly two elite players plus
//      four good ones — enough to force hard choices. Tune PRICE_BY_TIER to
//      make the game meaner or kinder.
//
// HOW TO RUN IT:
//   node scripts/draft-legend-numbers.mjs
// =============================================================

import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("../data/blues-legends.json", import.meta.url);

// ---- 1. Slot shapes (attack, defence) at the "solid" tier ----
// Edit these to change how each position feels before tier adjustments.
const SLOT_PROFILE = {
  GK: { attack: 18, defence: 78 },
  CB: { attack: 36, defence: 82 },
  CM: { attack: 62, defence: 64 },
  AM: { attack: 82, defence: 42 },
  ST: { attack: 86, defence: 30 },
};

// ---- 2. Tier adjustments ----
// Added to BOTH attack and defence (clamped 0–100).
const TIER_RATING_DELTA = { elite: 14, star: 8, solid: 0, squad: -8, filler: -16 };
// Price in £m for each tier.
const PRICE_BY_TIER = { elite: 100, star: 75, solid: 45, squad: 22, filler: 10 };

// ---- Famous names (hand-listed). Matched accent/case-insensitively. ----
// Move names between these lists to re-balance who is expensive.
const ELITE = [
  "Gianfranco Zola", "Frank Lampard", "John Terry", "Didier Drogba", "Eden Hazard",
  "Petr Cech", "N'Golo Kante", "Cole Palmer", "Michael Essien", "Claude Makelele",
  "Ashley Cole", "Marcel Desailly", "Gianluca Vialli", "Ruud Gullit", "Juan Mata",
  "Cesc Fabregas", "Diego Costa", "Thibaut Courtois", "Branislav Ivanovic",
  "Enzo Fernandez", "Moises Caicedo", "Dennis Wise", "Ricardo Carvalho", "Jimmy Floyd Hasselbaink",
];
const STAR = [
  "Gustavo Poyet", "Joe Cole", "Damien Duff", "Arjen Robben", "Florent Malouda",
  "Ramires", "Oscar", "Nemanja Matic", "David Luiz", "Andriy Shevchenko",
  "Mateo Kovacic", "Antonio Rudiger", "Cesar Azpilicueta", "Reece James", "Levi Colwill",
  "Raheem Sterling", "Kai Havertz", "Mason Mount", "Christian Pulisic", "Timo Werner",
  "Kepa Arrizabalaga", "Frank Leboeuf", "Eidur Gudjohnsen", "Salomon Kalou", "Nicolas Anelka",
  "Fernando Torres", "Pedro", "Marcos Alonso", "Jorginho", "Ben Chilwell",
  "Nicolas Jackson", "Willian", "Michael Ballack", "Petr Cech", "Wayne Bridge",
  "Emerson", "Robert Huth", "Glen Johnson", "Tammy Abraham", "Callum Hudson-Odoi",
];

// Accent/case-insensitive key for matching.
const key = (s) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
const ELITE_SET = new Set(ELITE.map(key));
const STAR_SET = new Set(STAR.map(key));

function tierFor(player) {
  const k = key(player.name);
  if (ELITE_SET.has(k)) return "elite";
  if (STAR_SET.has(k)) return "star";
  const n = player.seasons?.length ?? 0;
  if (n >= 4) return "solid";
  if (n >= 2) return "squad";
  return "filler";
}

const clamp = (n) => Math.max(1, Math.min(100, Math.round(n)));

function draftFor(player) {
  const slots = player.slots?.length ? player.slots : ["CM"]; // safe fallback
  let att = 0;
  let def = 0;
  let counted = 0;
  for (const s of slots) {
    const prof = SLOT_PROFILE[s];
    if (!prof) continue;
    att += prof.attack;
    def += prof.defence;
    counted++;
  }
  if (counted === 0) {
    att = SLOT_PROFILE.CM.attack;
    def = SLOT_PROFILE.CM.defence;
    counted = 1;
  }
  att /= counted;
  def /= counted;

  const tier = tierFor(player);
  const delta = TIER_RATING_DELTA[tier];
  return {
    priceM: PRICE_BY_TIER[tier],
    attack: clamp(att + delta),
    defence: clamp(def + delta),
    tier,
  };
}

// ---- Main ----
const file = JSON.parse(readFileSync(FILE, "utf8"));
let filled = 0;
let skipped = 0;
const tierCounts = {};

for (const p of file.players) {
  const needs = p.priceM == null || p.attack == null || p.defence == null;
  if (!needs) {
    skipped++;
    continue;
  }
  const d = draftFor(p);
  if (p.priceM == null) p.priceM = d.priceM;
  if (p.attack == null) p.attack = d.attack;
  if (p.defence == null) p.defence = d.defence;
  tierCounts[d.tier] = (tierCounts[d.tier] ?? 0) + 1;
  filled++;
}

writeFileSync(FILE, JSON.stringify(file, null, 2), "utf8");

console.log("=====================================================");
console.log(`  Drafted numbers for ${filled} player(s); left ${skipped} already-set untouched.`);
console.log("  Tier spread (this run):");
for (const [t, c] of Object.entries(tierCounts).sort((a, b) => b[1] - a[1]))
  console.log(`    ${t.padEnd(7)} ${c}   (price £${PRICE_BY_TIER[t]}m)`);
console.log("\n  All notes remain 'PLACEHOLDER — founder to review'. Tune in /admin/legends.");
console.log("=====================================================");
