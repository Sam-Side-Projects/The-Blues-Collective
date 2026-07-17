// =============================================================
// The Blues Collective — roster import for the 95-Point Game
// -------------------------------------------------------------
// WHAT THIS DOES (plain English):
//   Asks Wikidata (a free, open, official public database — no API key,
//   no scraping anyone's website) for every player recorded as a member
//   of Chelsea F.C.'s senior team, with the dates they were at the club
//   and the position they played. It turns those dates into a list of
//   seasons and writes the FACTS ONLY into data/blues-legends.json.
//
//   It does NOT invent prices or ratings — those are game-balance numbers
//   you'll set later. Anything it can't work out confidently is written to
//   data/blues-legends-todo.md for you to check by hand.
//
// HOW TO RUN IT:
//   1. Make sure you're connected to the internet.
//   2. In a terminal, from the project folder, run:
//        node scripts/import-blues-legends.mjs
//   3. Read the summary it prints, then open data/blues-legends-todo.md.
//
//   Safe to run again later: it MERGES. It keeps every price, rating and
//   correction you've made, and only fills in missing players or fields.
// =============================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const OUT_JSON = new URL("../data/blues-legends.json", import.meta.url);
const OUT_TODO = new URL("../data/blues-legends-todo.md", import.meta.url);

const CHELSEA_QID = "Q9616"; // Chelsea F.C. (men's senior team) on Wikidata
const MIN_SEASON_YEAR = 1992; // Premier League era begins 1992-93
const NOW = new Date();
// Latest season to include. Aug or later => the new season has started.
const MAX_SEASON_YEAR =
  NOW.getMonth() + 1 >= 8 ? NOW.getFullYear() : NOW.getFullYear();

// ---- Position mapping: Wikidata's words -> our six slots ----
// Our slots: GK, CB, CM, AM, ST. A player may fit several. Anything we
// can't confidently map is left empty and reported in the TODO file.
function labelToSlots(label) {
  const l = label.toLowerCase();
  const slots = new Set();
  if (l.includes("goalkeeper")) slots.add("GK");
  if (
    l.includes("back") || // centre-back, full-back, wing-back, left/right-back
    l.includes("defender") ||
    l.includes("sweeper") ||
    l.includes("defence") ||
    l.includes("defense")
  )
    slots.add("CB");
  if (
    l.includes("attacking midfield") ||
    l.includes("winger") ||
    l.includes("wide midfield") ||
    l.includes("playmaker") ||
    l.includes("inside forward") ||
    l.includes("second striker") ||
    l.includes("wide player")
  )
    slots.add("AM");
  else if (l.includes("midfield")) slots.add("CM"); // generic/central/defensive
  if (
    l.includes("forward") ||
    l.includes("striker") ||
    l.includes("centre-forward") ||
    l.includes("center-forward")
  ) {
    // "inside forward"/"second striker" already handled as AM above
    if (!l.includes("inside forward") && !l.includes("second striker")) slots.add("ST");
  }
  return [...slots];
}

// ---- Date -> season helpers ----
// A season runs Aug–May and is named by its starting year, e.g. 1996-97.
function seasonString(startYear) {
  const next = String(startYear + 1).slice(2).padStart(2, "0");
  return `${startYear}-${next}`;
}

// Wikidata year-only precision shows as YYYY-01-01. We treat Jan-1 as
// "year only" and flag it so you can verify the exact season boundaries.
function parseDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const yearOnly = month === 1 && day === 1; // likely year-precision
  return { year, month, day, yearOnly };
}

// First season a start date belongs to. Joined June or later => that season;
// earlier in the calendar year => a mid-season arrival in the ongoing season.
function firstSeasonYear(start) {
  if (start.yearOnly) return start.year; // assume joined for that year's season
  return start.month >= 6 ? start.year : start.year - 1;
}

// Last season an end date belongs to. Left in August or later => they featured
// in the new season; anything Jan–July => their last season ended that spring.
function lastSeasonYear(end) {
  if (end.yearOnly) return end.year - 1; // assume left in summer of that year
  return end.month >= 8 ? end.year : end.year - 1;
}

function clampSeasons(fromYear, toYear) {
  const lo = Math.max(fromYear, MIN_SEASON_YEAR);
  const hi = Math.min(toYear, MAX_SEASON_YEAR);
  const out = [];
  for (let y = lo; y <= hi; y++) out.push(seasonString(y));
  return out;
}

// ---- SPARQL query ----
const QUERY = `
SELECT ?player ?playerLabel ?start ?end ?pos ?posLabel WHERE {
  ?player p:P54 ?st.
  ?st ps:P54 wd:${CHELSEA_QID}.
  OPTIONAL { ?st pq:P580 ?start. }
  OPTIONAL { ?st pq:P582 ?end. }
  OPTIONAL { ?player wdt:P413 ?pos. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}`;

async function runQuery() {
  const url =
    "https://query.wikidata.org/sparql?format=json&query=" +
    encodeURIComponent(QUERY);
  const res = await fetch(url, {
    headers: {
      Accept: "application/sparql-results+json",
      // Wikidata asks every client to identify itself.
      "User-Agent":
        "TheBluesCollective-95PointGame/1.0 (fan project; contact via GitHub Sam-Side-Projects)",
    },
  });
  if (!res.ok) {
    throw new Error(
      `Wikidata replied ${res.status}. This is usually a temporary hiccup — wait a minute and run it again.`
    );
  }
  const json = await res.json();
  return json.results.bindings;
}

// ---- Aggregate raw rows into one record per player ----
function aggregate(rows) {
  const players = new Map(); // qid -> { qid, name, spells:[], positions:Set }
  for (const r of rows) {
    const qid = r.player.value.split("/").pop();
    const name = r.playerLabel?.value ?? qid;
    if (!players.has(qid)) {
      players.set(qid, { qid, name, spells: [], positions: new Set() });
    }
    const p = players.get(qid);
    // A spell is one start/end pair. Rows repeat per position, so key spells.
    const startRaw = r.start?.value ?? "";
    const endRaw = r.end?.value ?? "";
    const spellKey = `${startRaw}|${endRaw}`;
    if (!p.spells.some((s) => s.key === spellKey)) {
      p.spells.push({ key: spellKey, start: startRaw, end: endRaw });
    }
    if (r.posLabel?.value) p.positions.add(r.posLabel.value);
  }
  return players;
}

// ---- Build our factual record + collect gaps ----
function buildRecords(players) {
  const records = [];
  const gaps = {
    noPosition: [],
    unclearPosition: [],
    noDates: [],
    missingEnd: [],
    yearOnly: [],
  };

  for (const p of players.values()) {
    // Positions -> slots
    const slotSet = new Set();
    let hadAnyPositionWord = p.positions.size > 0;
    let mappedAny = false;
    for (const posLabel of p.positions) {
      const s = labelToSlots(posLabel);
      if (s.length) mappedAny = true;
      for (const x of s) slotSet.add(x);
    }
    const slots = [...slotSet];

    // Seasons across all spells
    const seasonSet = new Set();
    let usedYearOnly = false;
    let missingEndSpell = false;
    let hadUsableDates = false;

    for (const spell of p.spells) {
      const start = parseDate(spell.start);
      const end = parseDate(spell.end);
      if (!start && !end) continue; // no dates on this spell

      if (start && start.yearOnly) usedYearOnly = true;
      if (end && end.yearOnly) usedYearOnly = true;

      if (start && end) {
        hadUsableDates = true;
        for (const s of clampSeasons(firstSeasonYear(start), lastSeasonYear(end)))
          seasonSet.add(s);
      } else if (start && !end) {
        // No end date. In Wikidata, an open-ended team membership means the
        // player is STILL at the club, so we extend through the current season.
        // We always flag it for review in case it's really just a missing end
        // date on a player who has since left (rarer, but it happens).
        hadUsableDates = true;
        missingEndSpell = true;
        const fsy = firstSeasonYear(start);
        for (const s of clampSeasons(fsy, MAX_SEASON_YEAR)) seasonSet.add(s);
      } else if (!start && end) {
        // End but no start — we can't build a range. Record nothing, flag it.
        missingEndSpell = true;
      }
    }

    const seasons = [...seasonSet].sort();

    // Skip players with zero in-range seasons entirely — nothing to game with.
    // (This also keeps the gaps list focused on the 1992+ era: we don't want
    // to bother you about pre-war players who can never appear in the game.)
    if (seasons.length === 0) {
      if (p.spells.length && !hadUsableDates) gaps.noDates.push(p.name);
      continue;
    }

    // Gaps below are ONLY for players who actually made the 1992+ roster.
    if (!hadAnyPositionWord) gaps.noPosition.push(p.name);
    else if (!mappedAny)
      gaps.unclearPosition.push(`${p.name} — Wikidata says: ${[...p.positions].join(", ")}`);
    if (missingEndSpell) gaps.missingEnd.push(p.name);
    if (usedYearOnly) gaps.yearOnly.push(p.name);

    records.push({
      wikidataId: p.qid,
      name: p.name,
      seasons,
      slots,
      priceM: null,
      attack: null,
      defence: null,
      excluded: false,
      note: "PLACEHOLDER — founder to review",
    });
  }

  records.sort((a, b) => a.name.localeCompare(b.name));
  return { records, gaps };
}

// ---- Merge with any existing hand-tuned file ----
function mergeWithExisting(fresh) {
  if (!existsSync(OUT_JSON)) {
    return { merged: fresh, added: fresh.length, filled: 0, kept: 0 };
  }
  const existingFile = JSON.parse(readFileSync(OUT_JSON, "utf8"));
  const existing = existingFile.players ?? [];
  const byId = new Map(existing.map((e) => [e.wikidataId, e]));

  let added = 0;
  let filled = 0;
  let kept = 0;

  for (const f of fresh) {
    const cur = byId.get(f.wikidataId);
    if (!cur) {
      byId.set(f.wikidataId, f);
      added++;
      continue;
    }
    kept++;
    // Only fill FACTUAL fields that are currently missing. Never touch the
    // founder's numbers, notes, name corrections or exclusions.
    if ((!cur.seasons || cur.seasons.length === 0) && f.seasons.length) {
      cur.seasons = f.seasons;
      filled++;
    }
    if ((!cur.slots || cur.slots.length === 0) && f.slots.length) {
      cur.slots = f.slots;
      filled++;
    }
  }

  const merged = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { merged, added, filled, kept };
}

// ---- Write the TODO (gaps) file in plain English ----
function writeTodo(gaps) {
  const section = (title, items, help) => {
    if (!items.length) return "";
    return (
      `\n## ${title} (${items.length})\n\n${help}\n\n` +
      items.map((i) => `- ${i}`).join("\n") +
      "\n"
    );
  };

  const body =
    `# Blues Legends — things for you to check\n\n` +
    `_Generated ${NOW.toISOString().slice(0, 10)} by scripts/import-blues-legends.mjs._\n\n` +
    `These are the players the import could NOT place with full confidence. ` +
    `An empty field is always better than a confident guess, so anything ` +
    `uncertain was left for you rather than filled in. Fix them in the admin ` +
    `page (coming in Phase 1b) or tell me and I'll adjust.\n` +
    `\n> Note on loans: Wikidata doesn't always mark loan spells. A very short ` +
    `spell (one season) on a famous name may have been a loan — worth a glance.\n` +
    section(
      "No position listed",
      gaps.noPosition,
      "Wikidata has no position for these players, so they have no slot. They won't appear in the game until you give them one."
    ) +
    section(
      "Position unclear",
      gaps.unclearPosition,
      "Wikidata listed a position we couldn't map onto GK/CB/CM/AM/ST. Please pick the right slot(s)."
    ) +
    section(
      "No usable dates",
      gaps.noDates,
      "No start/end dates, so we couldn't work out which seasons they played. They were left out of the roster."
    ) +
    section(
      "Missing end date",
      gaps.missingEnd,
      "We know when they arrived but not when they left, so only the season we're sure of was recorded. Please confirm their full span."
    ) +
    section(
      "Year-only dates (verify season boundaries)",
      gaps.yearOnly,
      "Their dates were stored to the year only, so the exact first/last season is a best guess. Worth a quick check."
    );

  writeFileSync(OUT_TODO, body, "utf8");
}

// ---- Summary of the roster spread ----
function printSpread(records) {
  const bySlot = { GK: 0, CB: 0, CM: 0, AM: 0, ST: 0, "(none)": 0 };
  const byDecade = {};
  for (const r of records) {
    if (!r.slots.length) bySlot["(none)"]++;
    for (const s of r.slots) bySlot[s] = (bySlot[s] ?? 0) + 1;
    for (const season of r.seasons) {
      const decade = `${season.slice(0, 3)}0s`;
      byDecade[decade] = (byDecade[decade] ?? 0) + 1;
    }
  }
  console.log("\n  Players per slot (a player can count in several):");
  for (const [k, v] of Object.entries(bySlot)) console.log(`    ${k.padEnd(7)} ${v}`);
  console.log("\n  Season-appearances by decade:");
  for (const [k, v] of Object.entries(byDecade).sort()) console.log(`    ${k}  ${v}`);
}

// ---- Main ----
async function main() {
  console.log("Asking Wikidata for Chelsea's squad history…");
  const rows = await runQuery();
  console.log(`Wikidata returned ${rows.length} rows.`);

  const players = aggregate(rows);
  const { records, gaps } = buildRecords(players);

  const { merged, added, filled, kept } = mergeWithExisting(records);

  const file = {
    _readme:
      "Facts (name/seasons/slots) are imported from Wikidata. Numbers (priceM/attack/defence) are game-balance values YOU set — the import never touches them. Re-running merges: it keeps your edits and only fills missing facts. See the comment block in scripts/import-blues-legends.mjs and the gaps in data/blues-legends-todo.md.",
    _source: "Wikidata (https://www.wikidata.org), CC0. Fetched via SPARQL.",
    _generated: NOW.toISOString(),
    players: merged,
  };
  writeFileSync(OUT_JSON, JSON.stringify(file, null, 2), "utf8");
  writeTodo(gaps);

  const gapCount =
    gaps.noPosition.length +
    gaps.unclearPosition.length +
    gaps.noDates.length +
    gaps.missingEnd.length +
    gaps.yearOnly.length;

  console.log("\n=====================================================");
  console.log(`  Roster written to data/blues-legends.json`);
  console.log(`  Total players in roster: ${merged.length}`);
  console.log(`  This run — added: ${added}, facts filled: ${filled}, kept untouched: ${kept}`);
  printSpread(merged);
  console.log(`\n  Gaps needing your attention: ${gapCount}`);
  console.log(`  -> see data/blues-legends-todo.md`);
  console.log("=====================================================\n");
}

main().catch((e) => {
  console.error("\nImport failed:", e.message);
  console.error("Nothing was changed. Fix the issue above and run it again.\n");
  process.exit(1);
});
