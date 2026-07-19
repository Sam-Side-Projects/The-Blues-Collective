import { readFile } from "node:fs/promises";
import path from "node:path";

export type MarketPlayer = {
  name: string;
  position: string; // GK/DEF/MID/FWD
  club: string;
  value: number; // €m
};

type MarketFile = {
  last_updated_by_hand?: string;
  squad: MarketPlayer[];
  targets: MarketPlayer[];
};

export const WINDOW_BUDGET = 250; // €m starting budget for GM mode

/**
 * Reads data/market-values.json (server-side only). This file is
 * hand-maintained by the site owner — see the comments inside it.
 */
export async function loadMarketValues(): Promise<MarketFile> {
  const filePath = path.join(process.cwd(), "data", "market-values.json");
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as MarketFile;
  return {
    last_updated_by_hand: parsed.last_updated_by_hand,
    squad: (parsed.squad ?? []).filter((p) => p && p.name),
    targets: (parsed.targets ?? []).filter((p) => p && p.name),
  };
}

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
