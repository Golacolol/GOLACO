export type EnglishLeague = "PREMIER_LEAGUE" | "CHAMPIONSHIP" | "LEAGUE_ONE";

export type TeamType =
  | "CURRENT_TEAM"
  | "HISTORIC_TEAM"
  | "HISTORIC_OPPONENT"
  | "FANS_TEAM"
  | "CUSTOM_TEAM"
  | "LEGENDS_TEAM"
  | "YOUTH_TEAM"
  | "STORY_TEAM"
  | "INTERNATIONAL";

export type VenueType =
  | "PRO_STADIUM"
  | "SMALL_STADIUM"
  | "COMMUNITY_PITCH"
  | "TRAINING_GROUND"
  | "HISTORIC_GROUND"
  | "CUSTOM";

export type ScoreboardType = "LED_VIDEO_SCREEN" | "TRADITIONAL_SCOREBOARD" | "NONE";

export type CrowdSupport = "HOME" | "AWAY" | "NEUTRAL";

export type PositionCode =
  | "GK"
  | "RB"
  | "CB"
  | "LB"
  | "RWB"
  | "LWB"
  | "DM"
  | "CM"
  | "AM"
  | "RM"
  | "LM"
  | "RW"
  | "LW"
  | "ST";

export interface AppearanceData {
  portraitAsset?: string | null;
  fullBodyAsset?: string | null;
  modelId?: string;
  skinTone?: number;
  hairStyle?: "short" | "fade" | "curl" | "long" | "bald";
  hairColor?: string;
  bootStyle?: string;
  sleeveStyle?: "short" | "long";
  heightScale?: number;
  bodyType?: "lean" | "standard" | "stocky";
  /** Optional birthplace from openfootball / bio enrich (display only). */
  birthplace?: string;
  /** Full legal / wiki-friendly name from openfootball (for portraits & bios). */
  fullName?: string;
}

export interface PlayerAttributes {
  /** Top running speed (1–100). */
  pace: number;
  /** Rate of reaching sprint speed (1–100). */
  acceleration?: number;
  /** Turning / change-of-direction (1–100). */
  agility?: number;
  /** Stability in turns and contact (1–100). */
  balance?: number;
  passing: number;
  longPassing: number;
  vision: number;
  /** Wide delivery technique (1–100). */
  crossing?: number;
  control: number;
  dribbling: number;
  shooting: number;
  finishing: number;
  shotPower: number;
  longShots: number;
  /** Heading technique / accuracy — not jump height (1–100). */
  heading?: number;
  penalties?: number;
  setPieces?: number;
  defending: number;
  defensiveAwareness?: number;
  /** Slide / standing challenge execution. Defaults to defending when omitted. */
  tackling?: number;
  /** Aerial jump capability. Defaults from strength/pace when omitted. */
  jumping?: number;
  /** Press / contest willingness — not tackle success (1–100). */
  aggression?: number;
  strength: number;
  stamina: number;
  composure: number;
  /** Off-ball run / space selection (1–100). */
  attackingAwareness?: number;
  /** Response to loose balls, transitions, rebounds (1–100). */
  reactions?: number;
  gkDiving?: number;
  gkHandling?: number;
  gkPositioning?: number;
  gkReflexes?: number;
  gkKicking?: number;
}

export interface PlayerPhysicalFacts {
  heightCm?: number;
  weightKg?: number;
  preferredFoot?: "L" | "R" | "left" | "right";
}

export interface PlayerRecord extends PlayerAttributes, PlayerPhysicalFacts {
  id: string;
  name: string;
  displayName: string;
  primaryPosition: PositionCode;
  secondaryPositions: PositionCode[];
  overall?: number;
  age?: number;
  appearance?: AppearanceData;
}

export interface RatingOverride extends Partial<PlayerAttributes> {
  overall?: number;
}

export interface TeamKit {
  shirt: string;
  shorts: string;
  socks: string;
  trim?: string;
  numberColor?: string;
  /**
   * Optional shirt wrap texture (e.g. /assets/kits/{teamId}_home.png).
   * Drop-in community kit PNGs are drawn onto the player torso/arms.
   */
  shirtAsset?: string | null;
}

/** Prematch kit picker: auto follows clash rules; home/away force that strip. */
export type KitChoice = "auto" | "home" | "away";

export interface TeamRecord {
  id: string;
  name: string;
  abbreviation: string;
  teamType: TeamType;
  city?: string;
  primaryColor: string;
  secondaryColor: string;
  /** Optional crest / emblem URL (e.g. /assets/crests/plymouth_argyle.png). */
  badgeAsset?: string | null;
  defaultKit: TeamKit;
  /** Change kit used when home colours clash with the opponent. */
  awayKit?: TeamKit;
  goalkeeperKit: TeamKit;
  defaultStadiumId: string;
  defaultFormation: string;
  league?: EnglishLeague;
  historicSeason?: string;
  fanTeam?: boolean;
  custom?: boolean;
}

export interface TeamMembership {
  playerId: string;
  teamId: string;
  shirtNumber: number;
  squadRole: "FIRST_TEAM" | "BENCH" | "YOUTH" | "LEGEND" | "FAN" | "STORY";
  captain?: boolean;
  from?: string;
  to?: string | null;
  ratingOverride?: RatingOverride;
}

export interface LineupSlot {
  playerId: string;
  slot: string;
  /** Optional nudge from formation default along pitch length (0–1 space). */
  offsetX?: number;
  /** Optional nudge from formation default along pitch width (−0.5–0.5 space). */
  offsetZ?: number;
}

export interface LineupRecord {
  id: string;
  teamId: string;
  formation: string;
  starters: LineupSlot[];
}

export interface FixtureRecord {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  venueId: string;
  competition: string;
  date: string;
  time: string;
  durationSeconds: number;
  homeLineupId?: string;
  awayLineupId?: string;
  gameplayModeDefault?: "REAL" | "ARCADE";
  timeOfDay?: "DAY" | "EVENING" | "NIGHT";
  weather?: "SUNNY" | "MILD" | "RAINY" | "SNOWY";
  played?: boolean;
  homeScore?: number;
  awayScore?: number;
  simulated?: boolean;
  official?: boolean;
}

export interface CrowdSectionRecord {
  id: string;
  support: CrowdSupport;
  stand: "north" | "south" | "east" | "west";
  density: number;
}

export interface ScoreboardConfig {
  type: ScoreboardType;
  position: [number, number, number];
  rotation: [number, number, number];
  width: number;
  height: number;
}

export interface StadiumRecord {
  id: string;
  name: string;
  venueType: VenueType;
  pitchLength: number;
  pitchWidth: number;
  standConfiguration: "four" | "one" | "none" | "deluxe";
  crowdCapacity: number;
  crowdSections: CrowdSectionRecord[];
  scoreboard: ScoreboardConfig;
  floodlights: boolean;
  tunnel: boolean;
  benches: boolean;
  advertisingSetId: string;
  environment: "urban" | "park" | "historic";
  lightingPreset: "DAY" | "EVENING_FLOODLIGHT" | "NIGHT";
  crowdDensity: number;
  audioProfile: string;
}

export interface AdvertisingBoardRecord {
  board: number;
  image?: string;
  label: string;
  color: string;
  textColor?: string;
}

export interface StoryChapter {
  type: "football" | "arcade" | "world";
  opponent?: string;
  levels?: string[];
  location?: string;
}

export interface StoryRecord {
  storyId: string;
  homeTeam: string;
  chapters: StoryChapter[];
}
