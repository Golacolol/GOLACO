import type { TableLayoutId } from "./TableLayouts";
import type { TableAIDifficulty } from "./TableAI";

export type TableOpponent = "AI" | "HUMAN";

export interface TableMatchConfig {
  layoutId: TableLayoutId;
  /** Used when layoutId === OPEN_CUSTOM; GK forced to 1. */
  customMen: [number, number, number, number];
  opponent: TableOpponent;
  difficulty: TableAIDifficulty;
  /** First to this many goals (default 5). */
  firstTo: number;
  homeColor?: number;
  awayColor?: number;
}

export const DEFAULT_TABLE_CONFIG: TableMatchConfig = {
  layoutId: "FRENCH_CLASSIC",
  customMen: [1, 2, 5, 3],
  opponent: "AI",
  difficulty: "NORMAL",
  firstTo: 5,
};

export function normalizeTableConfig(partial?: Partial<TableMatchConfig> | null): TableMatchConfig {
  const base = { ...DEFAULT_TABLE_CONFIG, ...(partial ?? {}) };
  const men = base.customMen ?? DEFAULT_TABLE_CONFIG.customMen;
  base.customMen = [
    1,
    Math.max(1, Math.min(5, men[1] ?? 2)),
    Math.max(1, Math.min(5, men[2] ?? 5)),
    Math.max(1, Math.min(5, men[3] ?? 3)),
  ];
  base.firstTo = Math.max(1, Math.min(21, base.firstTo || 5));
  if (base.opponent !== "HUMAN") base.opponent = "AI";
  return base;
}
