export const FootballState = {
  PRE_MATCH: "PRE_MATCH",
  KICK_OFF: "KICK_OFF",
  PLAYING: "PLAYING",
  STOPPAGE: "STOPPAGE",
  FREE_KICK: "FREE_KICK",
  PENALTY: "PENALTY",
  CORNER: "CORNER",
  GOAL_KICK: "GOAL_KICK",
  THROW_IN: "THROW_IN",
  GOAL: "GOAL",
  GOAL_CELEBRATION: "GOAL_CELEBRATION",
  HALF_TIME: "HALF_TIME",
  FULL_TIME: "FULL_TIME",
  PAUSED: "PAUSED",
  AUTOPLAY: "AUTOPLAY",
} as const;

export type FootballState = (typeof FootballState)[keyof typeof FootballState];
