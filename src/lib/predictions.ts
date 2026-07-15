/**
 * Prediction-league helpers (pure functions — no database or network here).
 *
 * The game: fans predict Chelsea's starting XI for the next fixture. After the
 * real team sheet is confirmed, we score each prediction:
 *   • 1 point for every player they correctly picked to start
 *   • a 3-point bonus if they also nailed the exact formation
 * So a perfect prediction is 11 + 3 = 14 points.
 */
import {
  FORMATIONS,
  FORMATION_NAMES,
  type FormationName,
} from "@/lib/formations";

export const POINTS_PER_STARTER = 1;
export const FORMATION_BONUS = 3;
export const MAX_POINTS = 11 * POINTS_PER_STARTER + FORMATION_BONUS;

export type PredictionSlot = {
  slotId: string;
  role: string;
  playerId: number | null;
  playerName: string | null;
};

export type PredictionEntry = {
  formation: string;
  slots: PredictionSlot[];
};

/** Lowercase, strip accents/punctuation so "N'Golo Kanté" == "ngolo kante". */
export function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // drop accents
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFormation(f: string | null | undefined): string {
  return (f ?? "").replace(/\s/g, "");
}

/** Non-null player names from a prediction's slots, de-duplicated. */
export function starterNames(slots: PredictionSlot[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of slots) {
    const key = normalizeName(s.playerName);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s.playerName as string);
  }
  return out;
}

/**
 * Score one prediction against the confirmed XI.
 * `predictedNames` and `confirmedNames` are raw display names; we normalise
 * internally so accents/capitalisation don't cause false misses.
 */
export function scorePrediction(
  predictedNames: string[],
  predictedFormation: string,
  confirmedNames: string[],
  confirmedFormation: string | null
): { points: number; correctStarters: number; formationBonus: boolean } {
  const confirmedSet = new Set(confirmedNames.map(normalizeName));
  confirmedSet.delete("");

  const counted = new Set<string>();
  let correct = 0;
  for (const n of predictedNames) {
    const key = normalizeName(n);
    if (!key || counted.has(key)) continue;
    counted.add(key);
    if (confirmedSet.has(key)) correct++;
  }

  const formationBonus =
    !!confirmedFormation &&
    normalizeFormation(predictedFormation) === normalizeFormation(confirmedFormation);

  const points = correct * POINTS_PER_STARTER + (formationBonus ? FORMATION_BONUS : 0);
  return { points, correctStarters: correct, formationBonus };
}

export type ConsensusSlot = {
  slotId: string;
  role: string;
  playerId: number | null;
  playerName: string | null;
  pickPct: number; // % of predictors who put this player in their XI
};

export type Consensus = {
  formation: FormationName;
  slots: ConsensusSlot[];
  totalPredictions: number;
};

/**
 * Build the community "consensus XI" from everyone's predictions for a fixture:
 * use the most-predicted formation, then fill each slot with the most-picked
 * unused player that fits the slot's role.
 */
export function buildConsensus(predictions: PredictionEntry[]): Consensus | null {
  const total = predictions.length;
  if (total === 0) return null;

  // Most popular formation (fall back to the first known formation).
  const formationTally = new Map<string, number>();
  for (const p of predictions) {
    formationTally.set(p.formation, (formationTally.get(p.formation) ?? 0) + 1);
  }
  let formation: FormationName = FORMATION_NAMES[0];
  let bestFormationCount = -1;
  for (const [f, count] of formationTally) {
    if (FORMATIONS[f as FormationName] && count > bestFormationCount) {
      bestFormationCount = count;
      formation = f as FormationName;
    }
  }

  // Tally how many predictions include each player (by normalised name).
  type Tally = { name: string; role: string; count: number };
  const byPlayer = new Map<string, Tally>();
  for (const p of predictions) {
    const seen = new Set<string>();
    for (const s of p.slots) {
      const key = normalizeName(s.playerName);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const existing = byPlayer.get(key);
      if (existing) existing.count++;
      else byPlayer.set(key, { name: s.playerName as string, role: s.role, count: 1 });
    }
  }

  const ranked = [...byPlayer.entries()].sort((a, b) => b[1].count - a[1].count);
  const used = new Set<string>();

  const slots: ConsensusSlot[] = FORMATIONS[formation].map((slotDef) => {
    // Prefer an unused player whose role matches; else best unused of any role.
    let pick =
      ranked.find(([key, t]) => !used.has(key) && t.role === slotDef.role) ??
      ranked.find(([key]) => !used.has(key)) ??
      null;
    if (pick) used.add(pick[0]);
    const count = pick ? pick[1].count : 0;
    return {
      slotId: slotDef.id,
      role: slotDef.role,
      playerId: null,
      playerName: pick ? pick[1].name : null,
      pickPct: Math.round((count / total) * 100),
    };
  });

  return { formation, slots, totalPredictions: total };
}

/** API-Football position codes (and full words) → our GK/DEF/MID/FWD roles. */
function toRole(pos: string | null | undefined): string {
  const p = (pos ?? "").toUpperCase();
  if (p === "G" || p.startsWith("GOAL")) return "GK";
  if (p === "D" || p.startsWith("DEF")) return "DEF";
  if (p === "F" || p.startsWith("ATT") || p.startsWith("FOR")) return "FWD";
  return "MID";
}

/**
 * Lay a confirmed team sheet onto a formation's slots for a pitch preview.
 * Players are matched to slots by role, in order, so it renders sensibly even
 * though the raw team sheet has no slot ids.
 */
export function confirmedToSlots(
  formation: string,
  starters: { player_name: string; position?: string | null }[]
): PredictionSlot[] {
  const def =
    FORMATIONS[formation as FormationName] ?? FORMATIONS[FORMATION_NAMES[0]];
  const pool = starters.map((s) => ({
    name: s.player_name,
    role: toRole(s.position),
    used: false,
  }));

  return def.map((slotDef) => {
    let pick = pool.find((p) => !p.used && p.role === slotDef.role);
    if (!pick) pick = pool.find((p) => !p.used);
    if (pick) pick.used = true;
    return {
      slotId: slotDef.id,
      role: slotDef.role,
      playerId: null,
      playerName: pick ? pick.name : null,
    };
  });
}
