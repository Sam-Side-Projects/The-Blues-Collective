/**
 * "Fans say: ~€Xm" — the community's sense of what a player is worth.
 *
 * This is NOT a market valuation and is never looked up from anywhere. It is
 * derived purely from fees fans have committed to in their own rebuilds, and
 * it is only ever shown as context — never pre-filled into a fee box, so it
 * can't anchor the next person's opinion.
 */

/**
 * How many separate proposals a player needs before we show a community value.
 * Below this we show nothing rather than pretend a couple of fees is a consensus.
 * ADJUST THIS as the site grows — higher means slower to appear but more solid.
 */
export const MIN_PROPOSALS_FOR_COMMUNITY_VALUE = 3;

/** Group the same player across rebuilds despite accents/initials/punctuation. */
export function playerKey(name: string): string {
  return (name ?? "")
    .normalize("NFD")
    .toLowerCase()
    // NFD splits accents into separate marks, so this also strips them:
    // "Jörgensen" -> "jorgensen". Initials and punctuation go too.
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type ProposalForMaths = {
  fee: number;
  realistic: number; // count of "realistic" votes
  noChance: number; // count of "not a chance" votes
};

/**
 * Weighted median of the proposed fees.
 *
 * - A proposal the community has flatly rejected (more "not a chance" votes
 *   than "realistic") is dropped entirely.
 * - Every surviving proposal carries a weight of 1 + its "realistic" votes, so
 *   fees other fans endorse pull the number harder than unvoted ones.
 * - We use a median rather than an average so one joke fee (€500m) can't drag
 *   the whole thing sideways.
 *
 * Returns null when there isn't enough to go on.
 */
export function weightedMedianFee(
  proposals: ProposalForMaths[]
): { value: number; count: number } | null {
  const usable = proposals.filter(
    (p) => Number.isFinite(p.fee) && p.fee > 0 && p.noChance <= p.realistic
  );
  if (usable.length < MIN_PROPOSALS_FOR_COMMUNITY_VALUE) return null;

  const weighted = usable
    .map((p) => ({ fee: p.fee, weight: 1 + Math.max(0, p.realistic) }))
    .sort((a, b) => a.fee - b.fee);

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  const halfway = totalWeight / 2;

  let running = 0;
  for (const w of weighted) {
    running += w.weight;
    if (running >= halfway) {
      return { value: Math.round(w.fee * 10) / 10, count: usable.length };
    }
  }
  // Fallback (shouldn't be reachable): use the last entry.
  const last = weighted[weighted.length - 1];
  return { value: Math.round(last.fee * 10) / 10, count: usable.length };
}
