/**
 * Foosball table layouts — rod positions and men counts.
 * Home attacks +x; rods ordered GK → DEF → MID → ATT for each side.
 */

export type TableLayoutId = "FRENCH_CLASSIC" | "TOURNAMENT_MODERN" | "OPEN_CUSTOM";

export type TableSkin = "wood_aged" | "tournament_slick" | "custom_matte";

/** Rod role from goalkeeper outward. */
export type RodRole = "GK" | "DEF" | "MID" | "ATT";

export interface TableDims {
  length: number;
  width: number;
  wallHeight: number;
  playY: number;
  goalWidth: number;
  goalDepth: number;
  ballRadius: number;
  manRadius: number;
  manHeight: number;
  rodRadius: number;
}

export interface RodSpec {
  role: RodRole;
  /** World X of the rod axis. */
  x: number;
  /** Number of men on this rod. */
  men: number;
  side: "home" | "away";
  /** Index 0..4 within the side (for key bindings 1–5 / 6–0). */
  index: number;
}

export interface TableLayout {
  id: TableLayoutId;
  label: string;
  skin: TableSkin;
  dims: TableDims;
  rods: RodSpec[];
  /** Default men counts [GK, DEF, MID, ATT] per side. */
  menPerRod: [number, number, number, number];
}

const BASE_DIMS: TableDims = {
  length: 12.2,
  width: 6.8,
  wallHeight: 0.55,
  playY: 0.42,
  goalWidth: 2.1,
  goalDepth: 0.35,
  ballRadius: 0.11,
  manRadius: 0.16,
  manHeight: 0.55,
  rodRadius: 0.045,
};

/** Classic baby-foot 1-2-5-3. */
const FRENCH_MEN: [number, number, number, number] = [1, 2, 5, 3];

function rodXs(length: number, tight: boolean): { home: number[]; away: number[] } {
  const half = length / 2;
  // From each goal toward midfield: GK, DEF, MID, ATT
  const inset = tight ? [0.55, 1.85, 3.55, 5.05] : [0.62, 2.05, 3.85, 5.35];
  const home = inset.map((d) => -half + d);
  const away = inset.map((d) => half - d);
  return { home, away };
}

function buildRods(
  men: [number, number, number, number],
  length: number,
  tight: boolean,
): RodSpec[] {
  const roles: RodRole[] = ["GK", "DEF", "MID", "ATT"];
  const { home, away } = rodXs(length, tight);
  const rods: RodSpec[] = [];
  for (let i = 0; i < 4; i++) {
    rods.push({ role: roles[i], x: home[i], men: men[i], side: "home", index: i });
  }
  // Away keys: 6=GK, 7=DEF, 8=MID, 9=ATT, 0 unused spare — plan says 6-0 for 5 rods;
  // we use 4 rods + index 0..3 mapped to 6,7,8,9 (0 selects all away).
  for (let i = 0; i < 4; i++) {
    rods.push({ role: roles[i], x: away[i], men: men[i], side: "away", index: i });
  }
  return rods;
}

export function frenchClassicLayout(): TableLayout {
  return {
    id: "FRENCH_CLASSIC",
    label: "French classic",
    skin: "wood_aged",
    dims: { ...BASE_DIMS },
    menPerRod: [...FRENCH_MEN],
    rods: buildRods(FRENCH_MEN, BASE_DIMS.length, false),
  };
}

export function tournamentModernLayout(): TableLayout {
  const dims = { ...BASE_DIMS, length: 11.6, width: 6.4, goalWidth: 2.0 };
  return {
    id: "TOURNAMENT_MODERN",
    label: "Tournament modern",
    skin: "tournament_slick",
    dims,
    menPerRod: [...FRENCH_MEN],
    rods: buildRods(FRENCH_MEN, dims.length, true),
  };
}

export function openCustomLayout(menPerRod: [number, number, number, number]): TableLayout {
  const clamped: [number, number, number, number] = [
    Math.max(1, Math.min(1, menPerRod[0])), // GK always 1
    Math.max(1, Math.min(5, menPerRod[1])),
    Math.max(1, Math.min(5, menPerRod[2])),
    Math.max(1, Math.min(5, menPerRod[3])),
  ];
  return {
    id: "OPEN_CUSTOM",
    label: "Open custom",
    skin: "custom_matte",
    dims: { ...BASE_DIMS },
    menPerRod: clamped,
    rods: buildRods(clamped, BASE_DIMS.length, false),
  };
}

export function layoutById(
  id: TableLayoutId,
  customMen?: [number, number, number, number],
): TableLayout {
  if (id === "TOURNAMENT_MODERN") return tournamentModernLayout();
  if (id === "OPEN_CUSTOM") return openCustomLayout(customMen ?? FRENCH_MEN);
  return frenchClassicLayout();
}

/** Max slide offset so outermost men stay inside side walls with margin. */
export function maxSlideForRod(men: number, dims: TableDims): number {
  if (men <= 0) return 0;
  const span = dims.width * 0.78;
  const spacing = men === 1 ? 0 : span / (men + 1);
  const outer = spacing * ((men - 1) / 2);
  const margin = dims.manRadius + 0.12;
  return Math.max(0, dims.width / 2 - outer - margin);
}

/** Local Z offsets of men along a rod at slide=0 (centered). */
export function manLocalZs(men: number, dims: TableDims): number[] {
  if (men <= 0) return [];
  if (men === 1) return [0];
  const span = dims.width * 0.78;
  const step = span / (men + 1);
  const zs: number[] = [];
  for (let i = 1; i <= men; i++) {
    zs.push(-span / 2 + step * i);
  }
  // Re-center
  const mid = (zs[0] + zs[zs.length - 1]) / 2;
  return zs.map((z) => z - mid);
}
