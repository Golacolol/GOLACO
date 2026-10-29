/** High-level game modes. */
export const GameMode = {
  FOOTBALL: "FOOTBALL",
  OPEN_WORLD: "OPEN_WORLD",
  ARCADE: "ARCADE",
  TABLE: "TABLE",
} as const;

export type GameMode = (typeof GameMode)[keyof typeof GameMode];
