import type { LineupRecord, PlayerRecord, TeamMembership } from "./schema";

const FROM = "2021-07-01";

export const ARGYLE_101_TEAM_ID = "argyle_historic_sample";
export const ARGYLE_101_LINEUP_ID = "argyle_historic_xi";
export const ARGYLE_101_FORMATION = "4-4-2";
export const ARGYLE_101_NAME = "Plymouth Argyle 101";
export const ARGYLE_101_ABBREVIATION = "101";

function legend(
  id: string,
  name: string,
  displayName: string,
  primaryPosition: PlayerRecord["primaryPosition"],
  secondaryPositions: PlayerRecord["primaryPosition"][],
  attrs: Partial<PlayerRecord> &
    Pick<
      PlayerRecord,
      | "pace"
      | "passing"
      | "longPassing"
      | "vision"
      | "control"
      | "dribbling"
      | "shooting"
      | "finishing"
      | "shotPower"
      | "longShots"
      | "defending"
      | "strength"
      | "stamina"
      | "composure"
    >,
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

export const ARGYLE_101_PLAYERS: PlayerRecord[] = [
  legend("player_101_m_cooper", "M. Cooper", "M. Cooper", "GK", [], {
    pace: 48, passing: 60, longPassing: 64, vision: 62, control: 58, dribbling: 40, shooting: 24, finishing: 20, shotPower: 54, longShots: 22, defending: 26, strength: 74, stamina: 66, composure: 78,
    gkDiving: 80, gkHandling: 79, gkPositioning: 78, gkReflexes: 82, gkKicking: 70, heightCm: 191,
    appearance: { skinTone: 0.6, hairStyle: "short", hairColor: "#2a2018", bodyType: "stocky", heightScale: 1.05, portraitAsset: null },
  }),
  legend("player_101_b_mumba", "B. Mumba", "B. Mumba", "LB", ["LWB", "LM", "LW"], {
    pace: 82, passing: 68, longPassing: 64, vision: 66, control: 70, dribbling: 74, shooting: 52, finishing: 48, shotPower: 60, longShots: 50, defending: 68, strength: 62, stamina: 84, composure: 66,
    preferredFoot: "L", heightCm: 176,
    appearance: { skinTone: 0.34, hairStyle: "fade", hairColor: "#111111", bodyType: "lean", portraitAsset: null },
  }),
  legend("player_101_gilesphey", "Gilesphey", "Gilesphey", "CB", ["RB"], {
    pace: 62, passing: 58, longPassing: 64, vision: 56, control: 60, dribbling: 48, shooting: 34, finishing: 30, shotPower: 64, longShots: 32, defending: 78, strength: 82, stamina: 72, composure: 70,
    heightCm: 188,
    appearance: { skinTone: 0.48, hairStyle: "short", hairColor: "#1a1410", bodyType: "stocky", heightScale: 1.03, portraitAsset: null },
  }),
  legend("player_101_d_scarr", "D. Scarr", "D. Scarr", "CB", ["LB"], {
    pace: 58, passing: 56, longPassing: 62, vision: 54, control: 58, dribbling: 44, shooting: 32, finishing: 28, shotPower: 66, longShots: 30, defending: 80, strength: 84, stamina: 70, composure: 68,
    heightCm: 192,
    appearance: { skinTone: 0.52, hairStyle: "bald", hairColor: "#2a2018", bodyType: "stocky", heightScale: 1.06, portraitAsset: null },
  }),
  legend("player_101_j_edwards", "J. Edwards", "J. Edwards", "RB", ["RWB", "RM", "RW"], {
    pace: 76, passing: 70, longPassing: 68, vision: 68, control: 68, dribbling: 66, shooting: 54, finishing: 50, shotPower: 62, longShots: 52, defending: 72, strength: 70, stamina: 84, composure: 72,
    heightCm: 178,
    appearance: { skinTone: 0.5, hairStyle: "short", hairColor: "#1a1410", bodyType: "standard", portraitAsset: null },
  }),
  legend("player_101_m_whittaker", "M. Whittaker", "M. Whittaker", "RW", ["RM", "ST"], {
    pace: 84, passing: 70, longPassing: 66, vision: 72, control: 74, dribbling: 80, shooting: 76, finishing: 74, shotPower: 78, longShots: 72, defending: 38, strength: 64, stamina: 78, composure: 72,
    preferredFoot: "L", heightCm: 183,
    appearance: { skinTone: 0.46, hairStyle: "fade", hairColor: "#111111", bodyType: "lean", portraitAsset: null },
  }),
  legend("player_101_f_azaz", "F. Azaz", "F. Azaz", "CM", ["AM", "LM"], {
    pace: 74, passing: 78, longPassing: 74, vision: 80, control: 78, dribbling: 80, shooting: 72, finishing: 68, shotPower: 70, longShots: 72, defending: 52, strength: 62, stamina: 80, composure: 74,
    preferredFoot: "R", heightCm: 180,
    appearance: { skinTone: 0.38, hairStyle: "curl", hairColor: "#111111", bodyType: "lean", portraitAsset: null },
  }),
  legend("player_101_a_randell", "A. Randell", "A. Randell", "CM", ["DM"], {
    pace: 70, passing: 76, longPassing: 74, vision: 74, control: 74, dribbling: 70, shooting: 62, finishing: 56, shotPower: 66, longShots: 64, defending: 68, strength: 68, stamina: 84, composure: 76,
    heightCm: 175,
    appearance: { skinTone: 0.54, hairStyle: "short", hairColor: "#2a2018", bodyType: "standard", portraitAsset: null },
  }),
  legend("player_101_c_wright", "C. Wright", "C. Wright", "RW", ["RM", "CM"], {
    pace: 78, passing: 72, longPassing: 68, vision: 72, control: 72, dribbling: 76, shooting: 68, finishing: 64, shotPower: 66, longShots: 66, defending: 46, strength: 60, stamina: 80, composure: 70,
    preferredFoot: "L", heightCm: 177,
    appearance: { skinTone: 0.44, hairStyle: "fade", hairColor: "#1a1410", bodyType: "lean", portraitAsset: null },
  }),
  legend("player_101_n_ennis", "N. Ennis", "N. Ennis", "ST", ["RW"], {
    pace: 86, passing: 62, longPassing: 54, vision: 66, control: 72, dribbling: 76, shooting: 76, finishing: 78, shotPower: 74, longShots: 64, defending: 32, strength: 68, stamina: 76, composure: 70,
    heightCm: 179,
    appearance: { skinTone: 0.32, hairStyle: "short", hairColor: "#111111", bodyType: "standard", portraitAsset: null },
  }),
  legend("player_101_r_hardie", "R. Hardie", "R. Hardie", "ST", [], {
    pace: 84, passing: 60, longPassing: 52, vision: 64, control: 70, dribbling: 72, shooting: 78, finishing: 80, shotPower: 76, longShots: 66, defending: 30, strength: 66, stamina: 78, composure: 72,
    heightCm: 181,
    appearance: { skinTone: 0.5, hairStyle: "short", hairColor: "#2a2018", bodyType: "lean", portraitAsset: null },
  }),
  legend("player_101_d_mayor", "D. Mayor", "D. Mayor", "CM", ["AM", "LM"], {
    pace: 72, passing: 80, longPassing: 76, vision: 82, control: 80, dribbling: 82, shooting: 68, finishing: 64, shotPower: 66, longShots: 70, defending: 48, strength: 58, stamina: 78, composure: 76,
    preferredFoot: "R", heightCm: 176,
    appearance: { skinTone: 0.56, hairStyle: "short", hairColor: "#1a1410", bodyType: "lean", portraitAsset: null },
  }),
  legend("player_101_j_houghton", "J. Houghton", "J. Houghton", "CM", ["DM"], {
    pace: 66, passing: 74, longPassing: 72, vision: 72, control: 72, dribbling: 68, shooting: 58, finishing: 52, shotPower: 62, longShots: 60, defending: 70, strength: 70, stamina: 82, composure: 74,
    heightCm: 178,
    appearance: { skinTone: 0.48, hairStyle: "fade", hairColor: "#2a2018", bodyType: "standard", portraitAsset: null },
  }),
  legend("player_101_s_cosgrove", "S. Cosgrove", "S. Cosgrove", "ST", [], {
    pace: 68, passing: 56, longPassing: 48, vision: 58, control: 64, dribbling: 60, shooting: 78, finishing: 80, shotPower: 82, longShots: 68, defending: 34, strength: 82, stamina: 70, composure: 68,
    heightCm: 188,
    appearance: { skinTone: 0.5, hairStyle: "short", hairColor: "#111111", bodyType: "stocky", heightScale: 1.04, portraitAsset: null },
  }),
  legend("player_101_m_butcher", "M. Butcher", "M. Butcher", "CM", ["DM", "CB"], {
    pace: 64, passing: 70, longPassing: 68, vision: 68, control: 68, dribbling: 62, shooting: 56, finishing: 50, shotPower: 64, longShots: 58, defending: 74, strength: 76, stamina: 80, composure: 70,
    heightCm: 185,
    appearance: { skinTone: 0.47, hairStyle: "short", hairColor: "#1a1410", bodyType: "stocky", portraitAsset: null },
  }),
  legend("player_101_j_wilson", "J. Wilson", "J. Wilson", "CB", ["RB"], {
    pace: 70, passing: 58, longPassing: 62, vision: 56, control: 60, dribbling: 50, shooting: 36, finishing: 32, shotPower: 62, longShots: 34, defending: 76, strength: 78, stamina: 74, composure: 68,
    heightCm: 186,
    appearance: { skinTone: 0.44, hairStyle: "short", hairColor: "#111111", bodyType: "standard", portraitAsset: null },
  }),
  legend("player_101_c_hazard", "C. Hazard", "C. Hazard", "GK", [], {
    pace: 44, passing: 56, longPassing: 60, vision: 58, control: 52, dribbling: 36, shooting: 20, finishing: 16, shotPower: 50, longShots: 18, defending: 24, strength: 70, stamina: 60, composure: 72,
    gkDiving: 76, gkHandling: 74, gkPositioning: 74, gkReflexes: 78, gkKicking: 68, heightCm: 190,
    appearance: { skinTone: 0.58, hairStyle: "short", hairColor: "#2a2018", bodyType: "stocky", heightScale: 1.04, portraitAsset: null },
  }),
  legend("player_101_b_waine", "B. Waine", "B. Waine", "ST", ["LW"], {
    pace: 78, passing: 58, longPassing: 50, vision: 60, control: 66, dribbling: 68, shooting: 72, finishing: 74, shotPower: 70, longShots: 62, defending: 30, strength: 64, stamina: 72, composure: 66,
    heightCm: 180,
    appearance: { skinTone: 0.42, hairStyle: "fade", hairColor: "#1a1410", bodyType: "lean", portraitAsset: null },
  }),
  legend("player_101_m_bundu", "M. Bundu", "M. Bundu", "ST", ["RW", "LW"], {
    pace: 80, passing: 60, longPassing: 54, vision: 62, control: 68, dribbling: 72, shooting: 74, finishing: 72, shotPower: 76, longShots: 66, defending: 34, strength: 72, stamina: 74, composure: 66,
    heightCm: 184,
    appearance: { skinTone: 0.3, hairStyle: "short", hairColor: "#111111", bodyType: "standard", portraitAsset: null },
  }),
  legend("player_101_j_pleguezuelo", "J. Pleguezuelo", "J. Pleguezuelo", "CB", ["DM"], {
    pace: 66, passing: 64, longPassing: 66, vision: 62, control: 64, dribbling: 54, shooting: 40, finishing: 34, shotPower: 62, longShots: 38, defending: 78, strength: 76, stamina: 76, composure: 72,
    heightCm: 184,
    appearance: { skinTone: 0.45, hairStyle: "short", hairColor: "#1a1410", bodyType: "standard", portraitAsset: null },
  }),
];

export const ARGYLE_101_XI: { id: string; shirtNumber: number; slot: string; captain?: boolean }[] = [
  { id: "player_101_m_cooper", shirtNumber: 1, slot: "GK" },
  { id: "player_101_j_edwards", shirtNumber: 8, slot: "RB", captain: true },
  { id: "player_101_d_scarr", shirtNumber: 6, slot: "RCB" },
  { id: "player_101_gilesphey", shirtNumber: 3, slot: "LCB" },
  { id: "player_101_b_mumba", shirtNumber: 17, slot: "LB" },
  { id: "player_101_m_whittaker", shirtNumber: 19, slot: "RM" },
  { id: "player_101_a_randell", shirtNumber: 20, slot: "RCM" },
  { id: "player_101_f_azaz", shirtNumber: 18, slot: "LCM" },
  { id: "player_101_c_wright", shirtNumber: 26, slot: "LM" },
  { id: "player_101_r_hardie", shirtNumber: 9, slot: "RST" },
  { id: "player_101_n_ennis", shirtNumber: 11, slot: "LST" },
];

export const ARGYLE_101_BENCH: { id: string; shirtNumber: number }[] = [
  { id: "player_101_d_mayor", shirtNumber: 10 },
  { id: "player_101_j_houghton", shirtNumber: 4 },
  { id: "player_101_s_cosgrove", shirtNumber: 16 },
  { id: "player_101_m_butcher", shirtNumber: 7 },
  { id: "player_101_j_wilson", shirtNumber: 5 },
  { id: "player_101_c_hazard", shirtNumber: 12 },
  { id: "player_101_b_waine", shirtNumber: 23 },
  { id: "player_101_m_bundu", shirtNumber: 15 },
  { id: "player_101_j_pleguezuelo", shirtNumber: 25 },
];

export const ARGYLE_101_MEMBERSHIPS: TeamMembership[] = [
  ...ARGYLE_101_XI.map((row) => ({
    playerId: row.id,
    teamId: ARGYLE_101_TEAM_ID,
    shirtNumber: row.shirtNumber,
    squadRole: "LEGEND" as const,
    captain: row.captain,
    from: FROM,
    to: null,
  })),
  ...ARGYLE_101_BENCH.map((row) => ({
    playerId: row.id,
    teamId: ARGYLE_101_TEAM_ID,
    shirtNumber: row.shirtNumber,
    squadRole: "LEGEND" as const,
    from: FROM,
    to: null,
  })),
];

export const ARGYLE_101_LINEUP: LineupRecord = {
  id: ARGYLE_101_LINEUP_ID,
  teamId: ARGYLE_101_TEAM_ID,
  formation: ARGYLE_101_FORMATION,
  starters: ARGYLE_101_XI.map((row) => ({ playerId: row.id, slot: row.slot })),
};
