export type MarketPlayer = {
  name: string;
  position: string; // GK/DEF/MID/FWD
  club: string;
  value: number; // €m
};

export const WINDOW_BUDGET = 250; // €m starting budget for GM mode

// NOTE: the old hand-typed data/market-values.json is no longer read anywhere.
// Squad values live in the database (squad_players.market_value) and signing
// fees are proposed by fans — see lib/communityValue.ts.

/**
 * Cost of a single move for budget maths. Fees are now fan-proposed: the user
 * types the fee for the specific deal (a permanent buy or a loan), and it's
 * charged in full either way. Loans naturally cost less because the fan enters
 * a smaller loan fee.
 */
export function moveCost(
  _kind: "buy" | "loan_in",
  value: number
): number {
  return value;
}

/** Money raised by an outgoing move (sales raise value; loans raise nothing). */
export function moveRaise(
  kind: "sell" | "loan_out",
  value: number
): number {
  return kind === "sell" ? value : 0;
}
