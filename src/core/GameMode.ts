/** High-level game modes. Only FOOTBALL is implemented in v0.3. */
export const GameMode = {
  FOOTBALL: "FOOTBALL",
  OPEN_WORLD: "OPEN_WORLD",
  ARCADE: "ARCADE",
} as const;

export type GameMode = (typeof GameMode)[keyof typeof GameMode];
