// =============================================================
// The 95-Point Game — shared rules & helpers (pure, no React/DB here)
// -------------------------------------------------------------
// Chelsea's 2004-05 side took 95 points and conceded 15. Build a six-player
// spine from any Chelsea era on a £400m bankroll and see if you can beat it.
// This file holds the fixed rules so the game screen (Phase 2) and the scorer
// (Phase 3) share exactly the same definitions.
// =============================================================

export const STARTING_BANKROLL = 400; // £m
export const RESPIN_COST = 25; // £m per re-spin
export const POINTS_TO_BEAT = 95; // the 2004-05 benchmark

/** A player as the game uses it (numbers are founder-set balance values). */
export type Player = {
  id: number;
  name: string;
  seasons: string[]; // e.g. ["2004-05", "2005-06"]
  slots: string[]; // any of GK / CB / CM / AM / ST
  priceM: number;
  attack: number; // 0-100
  defence: number; // 0-100
};

/** One of the six spine positions, filled in this fixed order. */
export type SlotId = "GK" | "CB" | "CM" | "AM" | "ST" | "WILD";

export type SlotDef = {
  id: SlotId;
  label: string; // shown on the pitch
  longLabel: string; // shown in the header / instructions
  /** Which player positions may fill this slot. null = any player (wildcard). */
  accepts: string[] | null;
};

// Fixed order: GK -> CB -> CM -> AM/Winger -> ST -> Wildcard.
export const SLOTS: SlotDef[] = [
  { id: "GK", label: "GK", longLabel: "Goalkeeper", accepts: ["GK"] },
  { id: "CB", label: "CB", longLabel: "Centre-back", accepts: ["CB"] },
  { id: "CM", label: "CM", longLabel: "Central midfielder", accepts: ["CM"] },
  {
    id: "AM",
    label: "AM",
    longLabel: "Attacking mid / winger",
    // Decision B: this flexible slot accepts any attacking or midfield player.
    accepts: ["AM", "CM", "ST"],
  },
  { id: "ST", label: "ST", longLabel: "Striker", accepts: ["ST"] },
  { id: "WILD", label: "★", longLabel: "Wildcard (any position)", accepts: null },
];

/** Does this player's position list qualify him for the given slot? */
export function fitsSlot(player: Player, slot: SlotDef): boolean {
  if (slot.accepts === null) return true; // wildcard
  return player.slots.some((s) => slot.accepts!.includes(s));
}

/** Did this player play in the given season? */
export function playedIn(player: Player, season: string): boolean {
  return player.seasons.includes(season);
}

/**
 * Players eligible for a slot from a drawn season: right position, actually
 * played that season, and not already signed (same real person once per game).
 * Affordability is checked separately so we can still SHOW players you can't
 * afford (greyed out) rather than hiding them.
 */
export function eligiblePlayers(
  players: Player[],
  season: string,
  slot: SlotDef,
  signedIds: Set<number>
): Player[] {
  return players
    .filter(
      (p) =>
        !signedIds.has(p.id) &&
        playedIn(p, season) &&
        fitsSlot(p, slot)
    )
    .sort((a, b) => b.priceM - a.priceM);
}

/**
 * Seasons that can usefully be landed on for a slot — i.e. at least one
 * still-available player fits the slot in that season. Keeps the wheel from
 * landing on a dead season with no valid pick.
 */
export function drawableSeasons(
  players: Player[],
  allSeasons: string[],
  slot: SlotDef,
  signedIds: Set<number>
): string[] {
  return allSeasons.filter((season) =>
    players.some(
      (p) =>
        !signedIds.has(p.id) && playedIn(p, season) && fitsSlot(p, slot)
    )
  );
}

// =============================================================
// SCORING  (Phase 3, reworked Phase 4)
// -------------------------------------------------------------
// This is NOT a match simulator. It's a transparent, ROLE-BASED estimate with
// fully visible working. All the numbers below are tunable balance values.
//
// The idea in plain English:
//   Every player is judged on the job his POSITION actually does. A keeper or
//   centre-back is judged on DEFENCE; a striker or winger on ATTACK; a midfielder
//   on both. So a great specialist's strength counts fully and his weak side no
//   longer drags the team down — which is what lets a smartly chosen team beat 95.
//
//   1. Your XI = your 6 signings + 5 generic "squad filler" players (rated 50).
//   2. Team Attack  = position-weighted average of everyone's ATTACK.
//      Team Defence = position-weighted average of everyone's DEFENCE.
//   3. Overall = the average of Team Attack and Team Defence.
//   4. Projected points = SLOPE × Overall + INTERCEPT  (clamped 0–114).
//   5. Verdict compares that to the 95-point benchmark.
// =============================================================

/**
 * How much each slot contributes to the attack vs defence averages. A keeper
 * only affects defence; a striker only attack; a midfielder both. Tune freely.
 */
export const SLOT_WEIGHTS: Record<SlotId, { atk: number; def: number }> = {
  GK: { atk: 0, def: 2.6 },
  CB: { atk: 0.4, def: 2.6 },
  CM: { atk: 1.7, def: 1.7 },
  AM: { atk: 2.6, def: 0.5 },
  ST: { atk: 2.6, def: 0 },
  WILD: { atk: 1.5, def: 1.5 },
};

export const FILLER_COUNT = 5; // the 5 non-spine outfield places
export const FILLER_RATING = 50; // attack & defence of a generic squad player
export const FILLER_WEIGHT = 0.5; // how much each filler pulls the averages
export const POINTS_SLOPE = 2.8; // maps Overall rating -> league points
export const POINTS_INTERCEPT = -107;
export const MAX_LEAGUE_POINTS = 114; // 38 games × 3

export type SpineRating = {
  teamAttack: number;
  teamDefence: number;
  overall: number;
  projectedPoints: number;
  projectedConceded: number;
};

/** A signing tagged with the slot it fills (needed for role-based weighting). */
export type RatedPick = { slotId: SlotId; attack: number; defence: number };

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Team attack & defence from role-weighted averages of signings + fillers. */
function teamRatings(picks: RatedPick[]): {
  teamAttack: number;
  teamDefence: number;
} {
  let numA = 0;
  let denA = 0;
  let numD = 0;
  let denD = 0;
  for (const p of picks) {
    const w = SLOT_WEIGHTS[p.slotId];
    numA += w.atk * p.attack;
    denA += w.atk;
    numD += w.def * p.defence;
    denD += w.def;
  }
  // Five generic fillers sit at rating 50 for both.
  numA += FILLER_COUNT * FILLER_WEIGHT * FILLER_RATING;
  denA += FILLER_COUNT * FILLER_WEIGHT;
  numD += FILLER_COUNT * FILLER_WEIGHT * FILLER_RATING;
  denD += FILLER_COUNT * FILLER_WEIGHT;
  return {
    teamAttack: denA ? numA / denA : FILLER_RATING,
    teamDefence: denD ? numD / denD : FILLER_RATING,
  };
}

/** Rate an XI built from these role-tagged signings (plus squad fillers). */
export function ratePlayers(picks: RatedPick[]): SpineRating {
  const { teamAttack, teamDefence } = teamRatings(picks);
  const overall = (teamAttack + teamDefence) / 2;
  const projectedPoints = clamp(
    Math.round(POINTS_SLOPE * overall + POINTS_INTERCEPT),
    0,
    MAX_LEAGUE_POINTS
  );
  // Flavour stat: stronger defence -> fewer goals conceded over a season.
  const projectedConceded = Math.max(0, Math.round((100 - teamDefence) * 0.6));

  return {
    teamAttack: Math.round(teamAttack * 10) / 10,
    teamDefence: Math.round(teamDefence * 10) / 10,
    overall: Math.round(overall * 10) / 10,
    projectedPoints,
    projectedConceded,
  };
}

/** One drawn (slot, season) pair — the constraints the wheel handed you. */
export type Draw = { slotId: SlotId; season: string };

export type BestSix = {
  picks: Player[]; // one per slot, in slot order
  rating: SpineRating;
  spent: number;
};

/**
 * The "best six you could have signed": for the SAME six drawn seasons and the
 * same budget, find the highest-projected valid XI. Because the six slots (and
 * therefore the weighting denominators) are fixed, each player's contribution
 * to the final score is additive, so this is a budgeted "pick the best of each
 * group" problem — solved exactly with a small knapsack that also guarantees
 * no repeated player.
 */
export function bestSix(
  players: Player[],
  draws: Draw[],
  budget: number
): BestSix | null {
  const cap = Math.round(budget);
  const groups = draws.map((d) => {
    const slot = SLOTS.find((s) => s.id === d.slotId)!;
    return { slotId: d.slotId, options: eligiblePlayers(players, d.season, slot, new Set<number>()) };
  });

  // A player's marginal contribution to the (weighted) attack+defence numerators.
  const value = (slotId: SlotId, p: Player) => {
    const w = SLOT_WEIGHTS[slotId];
    return w.atk * p.attack + w.def * p.defence;
  };

  // dp[spent] = best-scoring distinct selection using the groups so far.
  type State = { value: number; picks: Player[] };
  let dp: (State | null)[] = new Array(cap + 1).fill(null);
  dp[0] = { value: 0, picks: [] };

  for (const group of groups) {
    const next: (State | null)[] = new Array(cap + 1).fill(null);
    for (let spent = 0; spent <= cap; spent++) {
      const state = dp[spent];
      if (!state) continue;
      for (const p of group.options) {
        const price = Math.round(p.priceM);
        const ns = spent + price;
        if (ns > cap) continue;
        if (state.picks.some((x) => x.id === p.id)) continue; // no repeats
        const nv = state.value + value(group.slotId, p);
        if (!next[ns] || nv > next[ns]!.value) {
          next[ns] = { value: nv, picks: [...state.picks, p] };
        }
      }
    }
    dp = next;
  }

  let best: State | null = null;
  let bestSpent = 0;
  for (let spent = 0; spent <= cap; spent++) {
    const s = dp[spent];
    if (s && s.picks.length === draws.length && (!best || s.value > best.value)) {
      best = s;
      bestSpent = spent;
    }
  }
  if (!best) return null;

  return {
    picks: best.picks,
    rating: ratePlayers(
      best.picks.map((p, i) => ({
        slotId: draws[i].slotId,
        attack: p.attack,
        defence: p.defence,
      }))
    ),
    spent: bestSpent,
  };
}

/** Verdict text comparing projected points to the 95-point benchmark. */
export function verdict(projectedPoints: number): {
  beat: boolean;
  headline: string;
} {
  const gap = projectedPoints - POINTS_TO_BEAT;
  if (gap >= 0) {
    return { beat: true, headline: `You beat the Invincibles' 95 by ${gap}!` };
  }
  if (gap >= -5) {
    return { beat: false, headline: `So close — just ${-gap} short of 95.` };
  }
  if (gap >= -15) {
    return { beat: false, headline: `${-gap} points short of 95. Not bad.` };
  }
  return { beat: false, headline: `${-gap} short of 95. The 2004-05 side rests easy.` };
}

// =============================================================
// WEEKLY CHALLENGE  (Phase 4)
// -------------------------------------------------------------
// Every Monday 00:00 UK, a fixed seed gives EVERYONE the same six seasons.
// Players get one scored attempt per week (plus unlimited free practice).
// All the logic below is deterministic from the week key, so the server and
// every player's browser independently agree on the same six seasons.
// =============================================================

/** Small string hash -> 32-bit seed (xmur3). */
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** Deterministic PRNG in [0,1) seeded by a 32-bit integer (mulberry32). */
function seededRandom(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** London (UK) calendar Y/M/D for a given instant. Handles GMT/BST. */
function londonYMD(date: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** ISO-week key like "2026-W29" for a Y/M/D calendar date. */
function isoWeekKey(y: number, m: number, d: number): string {
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay() || 7; // Mon=1..Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - day); // nearest Thursday
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** The current weekly-challenge key, based on UK time. */
export function currentWeekKey(now: Date = new Date()): string {
  const { y, m, d } = londonYMD(now);
  return isoWeekKey(y, m, d);
}

/** Human label for a week key, e.g. "Week 29, 2026". */
export function weekLabel(key: string): string {
  const [year, w] = key.split("-W");
  return `Week ${Number(w)}, ${year}`;
}

/** UTC instant of the next Monday 00:00 UK — used for the countdown. */
export function nextWeeklyResetIso(now: Date = new Date()): string {
  const { y, m, d } = londonYMD(now);
  // Weekday of today's London date.
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7; // Mon=1..Sun=7
  const daysUntilMonday = dow === 1 ? 7 : 8 - dow; // always the NEXT Monday
  const target = new Date(Date.UTC(y, m - 1, d + daysUntilMonday, 0, 0, 0));
  // Adjust so the wall clock reads 00:00 in London, not UTC.
  const offsetMin =
    (new Date(
      target.toLocaleString("en-US", { timeZone: "Europe/London" })
    ).getTime() -
      new Date(target.toLocaleString("en-US", { timeZone: "UTC" })).getTime()) /
    60000;
  return new Date(target.getTime() - offsetMin * 60000).toISOString();
}

/**
 * The six fixed (slot, season) draws for a given week. Deterministic: same
 * week key + same roster => same six seasons for everyone. Each chosen season
 * is guaranteed to have at least one eligible player for its slot.
 */
export function weeklyDraws(
  players: Player[],
  allSeasons: string[],
  weekKey: string
): Draw[] {
  const rand = seededRandom(hashSeed(weekKey));
  const empty = new Set<number>();
  const draws: Draw[] = [];
  for (const slot of SLOTS) {
    const pool = drawableSeasons(players, allSeasons, slot, empty);
    const season = pool[Math.floor(rand() * pool.length)] ?? allSeasons[0];
    draws.push({ slotId: slot.id, season });
  }
  return draws;
}
