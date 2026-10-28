import type { LineupRecord, PlayerRecord, TeamMembership } from "./schema";

const FAN_FROM = "2026-01-01";

export const ARGYLE_FANS_TEAM_ID = "argyle_fans_xi";
export const ARGYLE_FANS_LINEUP_ID = "argyle_fans_xi_lineup";
export const ARGYLE_FANS_FORMATION = "4-4-2-W";
export const ARGYLE_FANS_NAME = "Plymouth Argyle Fans XI";
export const ARGYLE_FANS_ABBREVIATION = "FAN";

function fan(
  id: string,
  name: string,
  displayName: string,
  primaryPosition: PlayerRecord["primaryPosition"],
  secondaryPositions: PlayerRecord["primaryPosition"][],
  attrs: Partial<PlayerRecord> & Pick<PlayerRecord, "pace" | "passing" | "longPassing" | "vision" | "control" | "dribbling" | "shooting" | "finishing" | "shotPower" | "longShots" | "defending" | "strength" | "stamina" | "composure">,
): PlayerRecord {
  return {
    id,
    name,
    displayName,
    primaryPosition,
    secondaryPositions,
    preferredFoot: attrs.preferredFoot ?? "R",
    heightCm: attrs.heightCm,
    appearance: attrs.appearance,
    pace: attrs.pace,
    passing: attrs.passing,
    longPassing: attrs.longPassing,
    vision: attrs.vision,
    control: attrs.control,
    dribbling: attrs.dribbling,
    shooting: attrs.shooting,
    finishing: attrs.finishing,
    shotPower: attrs.shotPower,
    longShots: attrs.longShots,
    defending: attrs.defending,
    strength: attrs.strength,
    stamina: attrs.stamina,
    composure: attrs.composure,
    gkDiving: attrs.gkDiving,
    gkHandling: attrs.gkHandling,
    gkPositioning: attrs.gkPositioning,
    gkReflexes: attrs.gkReflexes,
    gkKicking: attrs.gkKicking,
  };
}

export const ARGYLE_FANS_PLAYERS: PlayerRecord[] = [
  fan("player_fan_cd_pafc", "CD-PAFC", "CD-PAFC", "GK", [], {
    pace: 44, passing: 54, longPassing: 60, vision: 56, control: 52, dribbling: 34, shooting: 20, finishing: 16, shotPower: 50, longShots: 18, defending: 24, strength: 72, stamina: 62, composure: 70,
    gkDiving: 73, gkHandling: 71, gkPositioning: 72, gkReflexes: 75, gkKicking: 66, heightCm: 188,
    appearance: { portraitAsset: "/images/l8.png", skinTone: 0.58, hairStyle: "short", hairColor: "#1a1410", bodyType: "stocky", heightScale: 1.04 },
  }),
  fan("player_fan_argyletweet", "Argyletweet", "Argyletweet", "LB", ["LWB", "LM"], {
    pace: 76, passing: 66, longPassing: 63, vision: 64, control: 68, dribbling: 68, shooting: 42, finishing: 38, shotPower: 58, longShots: 40, defending: 68, strength: 66, stamina: 82, composure: 64,
    preferredFoot: "L", heightCm: 176,
    appearance: { portraitAsset: "/images/l2.png", skinTone: 0.42, hairStyle: "fade", hairColor: "#111111", bodyType: "lean" },
  }),
  fan("player_fan_t_bones", "T. Bones", "T. Bones", "CB", ["RB"], {
    pace: 56, passing: 52, longPassing: 58, vision: 50, control: 54, dribbling: 42, shooting: 30, finishing: 26, shotPower: 62, longShots: 28, defending: 74, strength: 80, stamina: 68, composure: 63,
    heightCm: 190,
    appearance: { portraitAsset: "/images/l7.png", skinTone: 0.5, hairStyle: "bald", hairColor: "#2a2018", bodyType: "stocky", heightScale: 1.05 },
  }),
  fan("player_fan_v_doo", "V. Doo", "V. Doo", "CB", ["LB"], {
    pace: 60, passing: 55, longPassing: 61, vision: 54, control: 57, dribbling: 46, shooting: 32, finishing: 28, shotPower: 58, longShots: 30, defending: 73, strength: 74, stamina: 71, composure: 65,
    preferredFoot: "L", heightCm: 186,
    appearance: { portraitAsset: "/images/l4.png", skinTone: 0.36, hairStyle: "curl", hairColor: "#111111", bodyType: "standard" },
  }),
  fan("player_fan_a_tweets", "A. Tweets", "A. Tweets", "RB", ["RWB", "RM"], {
    pace: 75, passing: 65, longPassing: 62, vision: 63, control: 67, dribbling: 67, shooting: 41, finishing: 37, shotPower: 59, longShots: 39, defending: 69, strength: 65, stamina: 81, composure: 63,
    heightCm: 175,
    appearance: { portraitAsset: "/images/l3.png", skinTone: 0.48, hairStyle: "fade", hairColor: "#2a2018", bodyType: "lean" },
  }),
  fan("player_fan_s_argotweets", "S. ArgoTweets", "S. ArgoTweets", "RW", ["RM"], {
    pace: 75, passing: 66, longPassing: 62, vision: 64, control: 67, dribbling: 73, shooting: 60, finishing: 56, shotPower: 63, longShots: 55, defending: 42, strength: 56, stamina: 77, composure: 62,
    heightCm: 174,
    appearance: { portraitAsset: "/images/l1.png", skinTone: 0.44, hairStyle: "short", hairColor: "#111111", bodyType: "lean" },
  }),
  fan("player_fan_a_life", "A. Life", "A. Life", "CM", ["DM"], {
    pace: 65, passing: 73, longPassing: 71, vision: 72, control: 70, dribbling: 66, shooting: 58, finishing: 52, shotPower: 62, longShots: 58, defending: 60, strength: 63, stamina: 78, composure: 69,
    heightCm: 178,
    appearance: { portraitAsset: "/images/l23.png", skinTone: 0.46, hairStyle: "short", hairColor: "#1a1410", bodyType: "standard" },
  }),
  fan("player_fan_c_pilgrim", "C. Pilgrim", "C. Pilgrim", "CM", ["AM"], {
    pace: 64, passing: 74, longPassing: 72, vision: 73, control: 71, dribbling: 68, shooting: 60, finishing: 54, shotPower: 61, longShots: 59, defending: 56, strength: 61, stamina: 76, composure: 70,
    preferredFoot: "L", heightCm: 177,
    appearance: { portraitAsset: "/images/l6.png", skinTone: 0.52, hairStyle: "fade", hairColor: "#2a2018", bodyType: "standard" },
  }),
  fan("player_fan_l_days", "L. Days", "L. Days", "LW", ["LM"], {
    pace: 76, passing: 65, longPassing: 61, vision: 63, control: 68, dribbling: 74, shooting: 59, finishing: 55, shotPower: 60, longShots: 54, defending: 40, strength: 55, stamina: 78, composure: 63,
    preferredFoot: "L", heightCm: 173,
    appearance: { portraitAsset: "/images/l12.png", skinTone: 0.4, hairStyle: "long", hairColor: "#1a1410", bodyType: "lean" },
  }),
  fan("player_fan_s_down", "S. Down", "S. Down", "ST", [], {
    pace: 73, passing: 55, longPassing: 46, vision: 57, control: 65, dribbling: 63, shooting: 73, finishing: 75, shotPower: 72, longShots: 61, defending: 28, strength: 68, stamina: 71, composure: 64,
    heightCm: 183,
    appearance: { portraitAsset: "/images/l23.png", skinTone: 0.47, hairStyle: "short", hairColor: "#111111", bodyType: "stocky" },
  }),
  fan("player_fan_p_face", "P. Face", "P. Face", "ST", ["AM"], {
    pace: 71, passing: 58, longPassing: 50, vision: 62, control: 68, dribbling: 66, shooting: 72, finishing: 74, shotPower: 70, longShots: 63, defending: 30, strength: 64, stamina: 70, composure: 67,
    heightCm: 180,
    appearance: { portraitAsset: "/images/l26.png", skinTone: 0.43, hairStyle: "curl", hairColor: "#2a2018", bodyType: "standard" },
  }),
  fan("player_fan_a_bradderz", "A. Bradderz", "A. Bradderz", "CB", ["CM", "RB"], {
    pace: 62, passing: 58, longPassing: 60, vision: 56, control: 58, dribbling: 52, shooting: 42, finishing: 36, shotPower: 60, longShots: 40, defending: 70, strength: 73, stamina: 74, composure: 62,
    heightCm: 184,
    appearance: { skinTone: 0.49, hairStyle: "short", hairColor: "#1a1410", bodyType: "standard" },
  }),
  fan("player_fan_p_petey", "P. Petey", "P. Petey", "GK", [], {
    pace: 42, passing: 50, longPassing: 56, vision: 52, control: 48, dribbling: 30, shooting: 18, finishing: 14, shotPower: 46, longShots: 16, defending: 22, strength: 68, stamina: 58, composure: 66,
    gkDiving: 68, gkHandling: 67, gkPositioning: 66, gkReflexes: 70, gkKicking: 62, heightCm: 185,
    appearance: { skinTone: 0.55, hairStyle: "short", hairColor: "#2a2018", bodyType: "stocky" },
  }),
  fan("player_fan_c_pilgrim_14", "C. Pilgrim", "C. Pilgrim", "CM", ["ST", "AM"], {
    pace: 66, passing: 70, longPassing: 67, vision: 68, control: 67, dribbling: 65, shooting: 64, finishing: 60, shotPower: 64, longShots: 61, defending: 52, strength: 60, stamina: 75, composure: 66,
    heightCm: 176,
    appearance: { skinTone: 0.41, hairStyle: "fade", hairColor: "#111111", bodyType: "lean" },
  }),
];

export const ARGYLE_FANS_XI: { id: string; shirtNumber: number; slot: string; captain?: boolean }[] = [
  { id: "player_fan_cd_pafc", shirtNumber: 1, slot: "GK" },
  { id: "player_fan_argyletweet", shirtNumber: 2, slot: "LB" },
  { id: "player_fan_v_doo", shirtNumber: 21, slot: "LCB" },
  { id: "player_fan_t_bones", shirtNumber: 3, slot: "RCB" },
  { id: "player_fan_a_tweets", shirtNumber: 4, slot: "RB" },
  { id: "player_fan_l_days", shirtNumber: 11, slot: "LM" },
  { id: "player_fan_c_pilgrim", shirtNumber: 8, slot: "LCM" },
  { id: "player_fan_a_life", shirtNumber: 6, slot: "RCM" },
  { id: "player_fan_s_argotweets", shirtNumber: 7, slot: "RM" },
  { id: "player_fan_s_down", shirtNumber: 9, slot: "LST" },
  { id: "player_fan_p_face", shirtNumber: 10, slot: "RST", captain: true },
];

export const ARGYLE_FANS_BENCH: { id: string; shirtNumber: number }[] = [
  { id: "player_fan_a_bradderz", shirtNumber: 12 },
  { id: "player_fan_p_petey", shirtNumber: 13 },
  { id: "player_fan_c_pilgrim_14", shirtNumber: 14 },
];

export const ARGYLE_FANS_MEMBERSHIPS: TeamMembership[] = [
  ...ARGYLE_FANS_XI.map((row) => ({
    playerId: row.id,
    teamId: ARGYLE_FANS_TEAM_ID,
    shirtNumber: row.shirtNumber,
    squadRole: "FAN" as const,
    captain: row.captain,
    from: FAN_FROM,
    to: null,
  })),
  ...ARGYLE_FANS_BENCH.map((row) => ({
    playerId: row.id,
    teamId: ARGYLE_FANS_TEAM_ID,
    shirtNumber: row.shirtNumber,
    squadRole: "FAN" as const,
    from: FAN_FROM,
    to: null,
  })),
];

export const ARGYLE_FANS_LINEUP: LineupRecord = {
  id: ARGYLE_FANS_LINEUP_ID,
  teamId: ARGYLE_FANS_TEAM_ID,
  formation: ARGYLE_FANS_FORMATION,
  starters: ARGYLE_FANS_XI.map((row) => ({ playerId: row.id, slot: row.slot })),
};
