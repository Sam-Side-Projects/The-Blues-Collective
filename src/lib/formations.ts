/**
 * Formation definitions for the lineup builder.
 * Each slot has an x/y position on the pitch (0–100, where y=0 is the
 * defensive goal line and y=100 is the attacking end) and a "role" used
 * for position-fit sorting when picking a player.
 */
export type SlotRole = "GK" | "DEF" | "MID" | "FWD";

export type FormationSlot = {
  id: string; // stable id e.g. "GK", "LB", "CM1"
  label: string; // shown on the pitch e.g. "GK", "LB"
  role: SlotRole;
  x: number; // 0 (left) .. 100 (right)
  y: number; // 0 (own goal) .. 100 (opp goal)
};

export type FormationName = "4-3-3" | "4-2-3-1" | "3-4-2-1" | "4-4-2";

export const FORMATIONS: Record<FormationName, FormationSlot[]> = {
  "4-3-3": [
    { id: "GK", label: "GK", role: "GK", x: 50, y: 6 },
    { id: "LB", label: "LB", role: "DEF", x: 15, y: 26 },
    { id: "LCB", label: "CB", role: "DEF", x: 38, y: 22 },
    { id: "RCB", label: "CB", role: "DEF", x: 62, y: 22 },
    { id: "RB", label: "RB", role: "DEF", x: 85, y: 26 },
    { id: "CM1", label: "CM", role: "MID", x: 30, y: 50 },
    { id: "CM2", label: "CM", role: "MID", x: 50, y: 46 },
    { id: "CM3", label: "CM", role: "MID", x: 70, y: 50 },
    { id: "LW", label: "LW", role: "FWD", x: 18, y: 78 },
    { id: "ST", label: "ST", role: "FWD", x: 50, y: 84 },
    { id: "RW", label: "RW", role: "FWD", x: 82, y: 78 },
  ],
  "4-2-3-1": [
    { id: "GK", label: "GK", role: "GK", x: 50, y: 6 },
    { id: "LB", label: "LB", role: "DEF", x: 15, y: 26 },
    { id: "LCB", label: "CB", role: "DEF", x: 38, y: 22 },
    { id: "RCB", label: "CB", role: "DEF", x: 62, y: 22 },
    { id: "RB", label: "RB", role: "DEF", x: 85, y: 26 },
    { id: "DM1", label: "DM", role: "MID", x: 38, y: 44 },
    { id: "DM2", label: "DM", role: "MID", x: 62, y: 44 },
    { id: "LAM", label: "LM", role: "MID", x: 20, y: 66 },
    { id: "CAM", label: "AM", role: "MID", x: 50, y: 66 },
    { id: "RAM", label: "RM", role: "MID", x: 80, y: 66 },
    { id: "ST", label: "ST", role: "FWD", x: 50, y: 86 },
  ],
  "3-4-2-1": [
    { id: "GK", label: "GK", role: "GK", x: 50, y: 6 },
    { id: "LCB", label: "CB", role: "DEF", x: 28, y: 22 },
    { id: "CCB", label: "CB", role: "DEF", x: 50, y: 20 },
    { id: "RCB", label: "CB", role: "DEF", x: 72, y: 22 },
    { id: "LWB", label: "LWB", role: "DEF", x: 12, y: 48 },
    { id: "CM1", label: "CM", role: "MID", x: 40, y: 46 },
    { id: "CM2", label: "CM", role: "MID", x: 60, y: 46 },
    { id: "RWB", label: "RWB", role: "DEF", x: 88, y: 48 },
    { id: "LAM", label: "AM", role: "MID", x: 34, y: 70 },
    { id: "RAM", label: "AM", role: "MID", x: 66, y: 70 },
    { id: "ST", label: "ST", role: "FWD", x: 50, y: 86 },
  ],
  "4-4-2": [
    { id: "GK", label: "GK", role: "GK", x: 50, y: 6 },
    { id: "LB", label: "LB", role: "DEF", x: 15, y: 26 },
    { id: "LCB", label: "CB", role: "DEF", x: 38, y: 22 },
    { id: "RCB", label: "CB", role: "DEF", x: 62, y: 22 },
    { id: "RB", label: "RB", role: "DEF", x: 85, y: 26 },
    { id: "LM", label: "LM", role: "MID", x: 15, y: 54 },
    { id: "LCM", label: "CM", role: "MID", x: 40, y: 50 },
    { id: "RCM", label: "CM", role: "MID", x: 60, y: 50 },
    { id: "RM", label: "RM", role: "MID", x: 85, y: 54 },
    { id: "LST", label: "ST", role: "FWD", x: 38, y: 82 },
    { id: "RST", label: "ST", role: "FWD", x: 62, y: 82 },
  ],
};

export const FORMATION_NAMES = Object.keys(FORMATIONS) as FormationName[];
