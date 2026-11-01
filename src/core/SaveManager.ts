import { DEFAULT_KEY_BINDINGS, mergeKeyBindings, type KeyBindings } from "../football/controls/KeyBindings";
import { DEFAULT_KICK_OFF_TIME, DEFAULT_MATCH_DURATION, DEFAULT_TEAM_ID } from "../football/constants";
import { blankPredictions, normalizePredictions, type PredictionsState } from "../football/predictions/Predictions";
import { DEFAULT_TITLE_FONT, DEFAULT_CLUB_NAME_FONT, DEFAULT_CLUB_NAME_GLOW, DEFAULT_CLUB_NAME_GLOW_DIFFUSION, DEFAULT_CLUB_NAME_INVERT_COLORS, clampClubNameGlowDiffusion } from "../ui/TitleFonts";

export interface SavedSettings {
  matchDuration: number;
  cameraMode: "BROADCAST" | "TACTICAL" | "CLOSE";
  viewMode: "CLOSE" | "MEDIUM" | "WIDE" | "PLAYER" | "BIRD" | "BIRD_FAR";
  trackMode: "BALL" | "PLAYER" | "DYNAMIC";
  /** Shared camera zoom: 1 = default; higher = closer (sideline + bird). */
  cameraZoom: number;
  graphicsPreset: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
  debug: boolean;
  /** When true with debug, records AI decision events for analysis (off by default). */
  aiAnalysisTelemetry: boolean;
  /** Random-pool Classic Teams in Match Simulation Lab. Default OFF. */
  includeClassicInSimulations: boolean;
  formationDebug: boolean;
  masterVolume: number;
  invertShotY: boolean;
  gameplayMode: "REAL" | "ARCADE" | "TABLE" | "FLICK";
  /** TABLE foosball defaults. */
  tableLayoutId: "FRENCH_CLASSIC" | "TOURNAMENT_MODERN" | "OPEN_CUSTOM";
  tableOpponent: "AI" | "HUMAN";
  tableDifficulty: "EASY" | "NORMAL" | "HARD" | "EXPERT";
  tableFirstTo: number;
  tableCustomMen: [number, number, number, number];
  /** FLICK Flickball defaults. */
  flickOpponent: "AI" | "HUMAN";
  flickDifficulty: "EASY" | "NORMAL" | "HARD" | "EXPERT";
  flickFirstTo: number;
  /** Classic alternate flicks when true; open reactive play when false. */
  flickTurnBased: boolean;
  /** Main menu Team Select kit dial — HOME or AWAY for the user club. */
  menuKitChoice: "home" | "away";
  timeOfDay: "DAY" | "EVENING" | "NIGHT";
  weather: "SUNNY" | "MILD" | "RAINY" | "SNOWY";
  kickOffTime: string;
  defaultTeamId: string;
  titleFont: string;
  clubNameFont: string;
  clubNameGlow: boolean;
  clubNameGlowDiffusion: number;
  clubNameInvertColors: boolean;
  keyBindings: KeyBindings;
  homeHudRing: boolean;
  awayHudRing: boolean;
  homeShowPortraits: boolean;
  awayShowPortraits: boolean;
  homePortraitOpacity: number;
  awayPortraitOpacity: number;
  homePortraitScale: number;
  awayPortraitScale: number;
  homePortraitUpright: boolean;
  awayPortraitUpright: boolean;
  homeHidePlayers: boolean;
  awayHidePlayers: boolean;
  homeShowDefLine: boolean;
  homeShowMidLine: boolean;
  homeShowAttLine: boolean;
  awayShowDefLine: boolean;
  awayShowMidLine: boolean;
  awayShowAttLine: boolean;
  homeDefLineColor: string;
  homeMidLineColor: string;
  homeAttLineColor: string;
  awayDefLineColor: string;
  awayMidLineColor: string;
  awayAttLineColor: string;
  ballGoldRing: boolean;
  /** Formation panel hover titles / name tooltips on pitch & bench. Default off. */
  formationOverlays: boolean;
  /** Ring under the intended pass receiver while aiming. Default off. */
  showPassTargetHighlight: boolean;
  /** Visual football size: 1 = default, up to ~2.25. */
  ballScale: number;
  leagueProgression: boolean;
  audioEnabled: boolean;
}

export interface SaveData {
  settings: SavedSettings;
  teams: unknown[];
  players: unknown[];
  memberships: unknown[];
  fixtures: unknown[];
  advertising: unknown[];
  fansTeam: unknown | null;
  playedListedFixture: boolean;
  predictions: PredictionsState;
}

const KEY = "argyle-football-save-v05";

export const DEFAULT_SETTINGS: SavedSettings = {
  matchDuration: DEFAULT_MATCH_DURATION,
  cameraMode: "BROADCAST",
  viewMode: "MEDIUM",
  trackMode: "DYNAMIC",
  cameraZoom: 1,
  graphicsPreset: "VERY_HIGH",
  debug: false,
  aiAnalysisTelemetry: false,
  includeClassicInSimulations: false,
  formationDebug: false,
  masterVolume: 0.7,
  invertShotY: false,
  gameplayMode: "REAL",
  tableLayoutId: "FRENCH_CLASSIC",
  tableOpponent: "AI",
  tableDifficulty: "NORMAL",
  tableFirstTo: 5,
  tableCustomMen: [1, 2, 5, 3],
  flickOpponent: "AI",
  flickDifficulty: "NORMAL",
  flickFirstTo: 5,
  flickTurnBased: true,
  menuKitChoice: "home",
  timeOfDay: "EVENING",
  weather: "MILD",
  kickOffTime: DEFAULT_KICK_OFF_TIME,
  defaultTeamId: DEFAULT_TEAM_ID,
  titleFont: DEFAULT_TITLE_FONT,
  clubNameFont: DEFAULT_CLUB_NAME_FONT,
  clubNameGlow: DEFAULT_CLUB_NAME_GLOW,
  clubNameGlowDiffusion: DEFAULT_CLUB_NAME_GLOW_DIFFUSION,
  clubNameInvertColors: DEFAULT_CLUB_NAME_INVERT_COLORS,
  keyBindings: { ...DEFAULT_KEY_BINDINGS },
  homeHudRing: false,
  awayHudRing: false,
  homeShowPortraits: false,
  awayShowPortraits: false,
  homePortraitOpacity: 0.85,
  awayPortraitOpacity: 0.85,
  homePortraitScale: 1,
  awayPortraitScale: 1,
  homePortraitUpright: false,
  awayPortraitUpright: false,
  homeHidePlayers: false,
  awayHidePlayers: false,
  homeShowDefLine: false,
  homeShowMidLine: false,
  homeShowAttLine: false,
  awayShowDefLine: false,
  awayShowMidLine: false,
  awayShowAttLine: false,
  homeDefLineColor: "#3db7ff",
  homeMidLineColor: "#ffd24a",
  homeAttLineColor: "#ff5a6a",
  awayDefLineColor: "#7ad0ff",
  awayMidLineColor: "#ffc14d",
  awayAttLineColor: "#ff8a9a",
  ballGoldRing: false,
  formationOverlays: false,
  showPassTargetHighlight: false,
  ballScale: 1,
  leagueProgression: false,
  audioEnabled: true,
};

export class SaveManager {
  data: SaveData;

  constructor() {
    this.data = this.load();
  }

  load(): SaveData {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return this.blank();
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      const rawSettings = (parsed.settings ?? {}) as Partial<SavedSettings> & { hudPlayerRings?: boolean };
      const settings = { ...DEFAULT_SETTINGS, ...rawSettings, keyBindings: mergeKeyBindings(rawSettings.keyBindings) };
      if (settings.titleFont === "anton") settings.titleFont = DEFAULT_TITLE_FONT;
      if (!("homeHudRing" in rawSettings) && rawSettings.hudPlayerRings) {
        settings.homeHudRing = true;
        settings.awayHudRing = true;
      }
      settings.homePortraitOpacity = clamp01(settings.homePortraitOpacity);
      settings.awayPortraitOpacity = clamp01(settings.awayPortraitOpacity);
      settings.homePortraitScale = clampScale(settings.homePortraitScale);
      settings.awayPortraitScale = clampScale(settings.awayPortraitScale);
      settings.clubNameGlowDiffusion = clampClubNameGlowDiffusion(settings.clubNameGlowDiffusion);
      settings.clubNameGlow = settings.clubNameGlow !== false;
      settings.clubNameInvertColors = settings.clubNameInvertColors === true;
      settings.cameraZoom = clampCameraZoomSetting(settings.cameraZoom);
      settings.ballScale = clampBallScaleSetting(settings.ballScale);
      settings.homeDefLineColor = clampHex(settings.homeDefLineColor, DEFAULT_SETTINGS.homeDefLineColor);
      settings.homeMidLineColor = clampHex(settings.homeMidLineColor, DEFAULT_SETTINGS.homeMidLineColor);
      settings.homeAttLineColor = clampHex(settings.homeAttLineColor, DEFAULT_SETTINGS.homeAttLineColor);
      settings.awayDefLineColor = clampHex(settings.awayDefLineColor, DEFAULT_SETTINGS.awayDefLineColor);
      settings.awayMidLineColor = clampHex(settings.awayMidLineColor, DEFAULT_SETTINGS.awayMidLineColor);
      settings.awayAttLineColor = clampHex(settings.awayAttLineColor, DEFAULT_SETTINGS.awayAttLineColor);
      if (
        settings.gameplayMode !== "REAL" &&
        settings.gameplayMode !== "ARCADE" &&
        settings.gameplayMode !== "TABLE" &&
        settings.gameplayMode !== "FLICK"
      ) {
        settings.gameplayMode = "REAL";
      }
      if (settings.flickOpponent !== "AI" && settings.flickOpponent !== "HUMAN") settings.flickOpponent = "AI";
      if (
        settings.flickDifficulty !== "EASY" &&
        settings.flickDifficulty !== "NORMAL" &&
        settings.flickDifficulty !== "HARD" &&
        settings.flickDifficulty !== "EXPERT"
      ) {
        settings.flickDifficulty = "NORMAL";
      }
      settings.flickFirstTo = Math.max(1, Math.min(21, Number(settings.flickFirstTo) || 5));
      if (typeof settings.flickTurnBased !== "boolean") settings.flickTurnBased = true;
      if (settings.menuKitChoice !== "home" && settings.menuKitChoice !== "away") {
        settings.menuKitChoice = "home";
      }
      if (
        settings.tableLayoutId !== "FRENCH_CLASSIC" &&
        settings.tableLayoutId !== "TOURNAMENT_MODERN" &&
        settings.tableLayoutId !== "OPEN_CUSTOM"
      ) {
        settings.tableLayoutId = "FRENCH_CLASSIC";
      }
      if (settings.tableOpponent !== "AI" && settings.tableOpponent !== "HUMAN") settings.tableOpponent = "AI";
      if (!["EASY", "NORMAL", "HARD", "EXPERT"].includes(settings.tableDifficulty)) {
        settings.tableDifficulty = "NORMAL";
      }
      settings.tableFirstTo = Math.max(1, Math.min(21, Number(settings.tableFirstTo) || 5));
      {
        const m = settings.tableCustomMen;
        settings.tableCustomMen = [
          1,
          Math.max(1, Math.min(5, Number(m?.[1]) || 2)),
          Math.max(1, Math.min(5, Number(m?.[2]) || 5)),
          Math.max(1, Math.min(5, Number(m?.[3]) || 3)),
        ];
      }
      return {
        ...this.blank(),
        ...parsed,
        settings,
        playedListedFixture: Boolean(parsed.playedListedFixture),
        predictions: normalizePredictions(parsed.predictions),
      };
    } catch {
      return this.blank();
    }
  }

  save(): void {
    localStorage.setItem(KEY, JSON.stringify(this.data));
  }

  resetDefaults(): void {
    this.data = this.blank();
    this.save();
  }

  private blank(): SaveData {
    return {
      settings: { ...DEFAULT_SETTINGS },
      teams: [],
      players: [],
      memberships: [],
      fixtures: [],
      advertising: [],
      fansTeam: null,
      playedListedFixture: false,
      predictions: blankPredictions(),
    };
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.85;
  return Math.min(1, Math.max(0, n));
}

function clampCameraZoomSetting(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(1.85, Math.max(0.7, n));
}

function clampBallScaleSetting(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(2.25, Math.max(1, n));
}

function clampScale(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(0.4, n));
}

function clampHex(value: string, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}
