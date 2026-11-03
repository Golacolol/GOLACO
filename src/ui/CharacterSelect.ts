import type { GameDatabase, SquadPlayer } from "../core/Database";
import type { SaveManager } from "../core/SaveManager";
import {
  MITEAM_DEFAULT_BADGE,
  MITEAM_DEFAULT_CLUB_NAME,
  MITEAM_DEFAULT_PRIMARY,
  MITEAM_DEFAULT_SECONDARY,
  MITEAM_TEAM_ID,
} from "../core/SaveManager";
import { assetUrl } from "../core/assetUrl";
import {
  applyMiTeamToDb,
  buildMiTeamPlayerClubLooks,
  miTeamIdentityCustomized,
  setMiTeamBadge,
  setMiTeamClubName,
  setMiTeamColors,
} from "../football/miteam/MiTeam";
import { miteamCrestChoices } from "../football/miteam/MiTeamPool";
import {
  FORMATION_NAMES,
  getFormation,
  remapPlayersToFormation,
  USER_FORMATION,
  type FormationName,
} from "../football/teams/Formation";
import {
  normalizeFormationName,
  snapshotWorkingAsUser,
  type TeamTacticsUserSnapshot,
} from "../football/teams/TeamTactics";
import type { KitChoice, PlayerAttributes, PositionCode, TeamKit, TeamRecord } from "../data/schema";
import {
  PLAY_STYLE_IDS,
  PLAY_STYLE_LABELS,
  isPlayStyleId,
  type PlayStyleChoice,
  type PlayStyleId,
} from "../football/ai/PlayStyle";
import { kitsClash, pickTeamKit, teamHomeKit, teamResolvedAwayKit } from "../football/teams/KitClash";
import {
  applyPhysicalToAppearance,
  deriveOverall,
  listProfileAttrSpokes,
} from "../football/players/PlayerStats";
import type { PlayerCardTeamContext } from "./playerCardShared";
import {
  fitKitSurnameElements,
  kitInitialSurnameLabel,
  kitMarkerHtml,
  kitSurnameFromName,
  portraitAsset,
  portraitHtml,
  teamBadgeHtml,
} from "./Portrait";
import { contrastingKitText } from "./kitContrast";
import { imageLabel, listPlayerImages, uploadPlayerImage } from "./playerImages";
import { nextProfileStatsMode, profileStatsBlock, type ProfileStatsMode } from "./ProfileHex";
import {
  applyPlayerCardFlip,
  formatPlayerCardTeamName,
  isPlayerCardShowingBack,
  nextPlayerCardFlipY,
  playerCardFlipSideFromClientX,
} from "./playerCardShared";
import { setInfoOverlaysEnabled, titleAttr } from "./infoOverlays";

const EDIT_POSITIONS: PositionCode[] = [
  "GK",
  "RB",
  "CB",
  "LB",
  "RWB",
  "LWB",
  "DM",
  "CM",
  "AM",
  "RM",
  "LM",
  "RW",
  "LW",
  "ST",
];

type EditStatKey = keyof PlayerAttributes;

const EDIT_STAT_GROUPS: { title: string; fields: { key: EditStatKey; label: string; optional?: boolean }[] }[] = [
  {
    title: "Physical",
    fields: [
      { key: "pace", label: "Pace" },
      { key: "acceleration", label: "Accel", optional: true },
      { key: "agility", label: "Agility", optional: true },
      { key: "balance", label: "Balance", optional: true },
      { key: "strength", label: "Strength" },
      { key: "stamina", label: "Stamina" },
      { key: "jumping", label: "Jump", optional: true },
    ],
  },
  {
    title: "On the ball",
    fields: [
      { key: "control", label: "Control" },
      { key: "dribbling", label: "Dribble" },
      { key: "passing", label: "Pass" },
      { key: "longPassing", label: "Long pass" },
      { key: "crossing", label: "Crossing", optional: true },
    ],
  },
  {
    title: "Attacking",
    fields: [
      { key: "shooting", label: "Shooting" },
      { key: "finishing", label: "Finishing" },
      { key: "shotPower", label: "Shot pwr" },
      { key: "longShots", label: "Long shot" },
      { key: "heading", label: "Heading", optional: true },
      { key: "penalties", label: "Pens", optional: true },
      { key: "setPieces", label: "Set piece", optional: true },
    ],
  },
  {
    title: "Defending",
    fields: [
      { key: "defending", label: "Defend" },
      { key: "tackling", label: "Tackle", optional: true },
    ],
  },
  {
    title: "Mental",
    fields: [
      { key: "form", label: "Form", optional: true },
      { key: "vision", label: "Vision" },
      { key: "composure", label: "Composure" },
      { key: "reactions", label: "Reactions", optional: true },
      { key: "concentration", label: "Focus", optional: true },
      { key: "aggression", label: "Aggro", optional: true },
      { key: "attackingAwareness", label: "Att awr", optional: true },
      { key: "defensiveAwareness", label: "Def awr", optional: true },
    ],
  },
  {
    title: "Goalkeeper",
    fields: [
      { key: "gkDiving", label: "GK dive", optional: true },
      { key: "gkHandling", label: "GK hands", optional: true },
      { key: "gkPositioning", label: "GK pos", optional: true },
      { key: "gkReflexes", label: "GK ref", optional: true },
      { key: "gkKicking", label: "GK kick", optional: true },
    ],
  },
];

/** Payload from Formation squad right-click edit → persist. */
export type SquadPlayerEdit = {
  playerId: string;
  teamId: string;
  name: string;
  displayName: string;
  shirtNumber: number;
  primaryPosition: PositionCode;
  portraitAsset: string | null;
  heightCm: number | null;
  weightKg: number | null;
  /** Full attribute snapshot; `null` clears an optional field. */
  stats: Partial<Record<EditStatKey, number | null>>;
};

type TeamBadgeSource = {
  id?: string;
  name?: string;
  abbreviation?: string;
  badgeAsset?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
};

/** Max nudge from formation default (normalized pitch units). */
const MAX_OFFSET_X = 0.28;
const MAX_OFFSET_Z = 0.4;

/** Squad / bench line order: GK → RB → CBs → LB → RM → CMs → LM → ST. */
const LINE_BAND = {
  GK: 0,
  RB: 1,
  CB: 2,
  LB: 3,
  RM: 4,
  CM: 5,
  LM: 6,
  ST: 7,
} as const;

/** Formation kit disc: outfield uses club colours; GKs use a standard green kit with white text. */
const GK_MARKER_GREEN = "#1FAE5B";

function kitMarkerColors(
  primaryPosition: string,
  teamColor: string,
  teamSecondary: string,
): { primaryColor: string; textColor: string } {
  if (primaryPosition === "GK") {
    return { primaryColor: GK_MARKER_GREEN, textColor: "#FFFFFF" };
  }
  return {
    primaryColor: teamColor,
    textColor: contrastingKitText(teamColor, teamSecondary),
  };
}

function lineBandFromSlot(slot: string, _formation: string): number {
  if (slot === "GK") return LINE_BAND.GK;
  if (slot === "RB" || slot === "RWB") return LINE_BAND.RB;
  if (slot === "RCB" || slot === "CB" || slot === "LCB") return LINE_BAND.CB;
  if (slot === "LB" || slot === "LWB") return LINE_BAND.LB;
  if (slot === "RM" || slot === "RAM") return LINE_BAND.RM;
  if (slot === "LM" || slot === "LAM") return LINE_BAND.LM;
  if (slot === "ST" || slot === "RST" || slot === "LST" || slot === "RW" || slot === "LW") return LINE_BAND.ST;
  return LINE_BAND.CM;
}

/** Right (0) → centre (1) → left (2). */
function sideRankFromSlot(slot: string, z: number): number {
  if (slot.startsWith("R") || z > 0.05) return 0;
  if (slot.startsWith("L") || z < -0.05) return 2;
  return 1;
}

function kitSurname(name: string): string {
  return kitSurnameFromName(name);
}

/** Roster / detail heading: `R. HARDIE` — initial only, never a full first name. */
function kitHeadingName(player: { displayName?: string; name?: string }): string {
  return kitInitialSurnameLabel(player.displayName, player.name);
}

/** Shrink the right-side formation toolbar chips so they stay inside the head. */
/** Fit the formation team title inside its crest+label row (do not count the crest as text width). */
export function fitFormationTeamTitle(title: HTMLElement): void {
  const host = title.parentElement;
  if (!host) return;
  let siblings = 0;
  for (const child of Array.from(host.children)) {
    if (child === title) continue;
    siblings += (child as HTMLElement).offsetWidth;
  }
  const hostStyle = getComputedStyle(host);
  const gap = parseFloat(hostStyle.columnGap || hostStyle.gap || "0") || 0;
  const gaps = Math.max(0, host.children.length - 1) * gap;
  const maxW = Math.max(40, host.clientWidth - siblings - gaps - 4);
  title.style.fontSize = "";
  title.style.letterSpacing = "";
  title.style.whiteSpace = "nowrap";
  let size = parseFloat(getComputedStyle(title).fontSize) || 30;
  let tracking = parseFloat(getComputedStyle(title).letterSpacing) || 0.05;
  // letterSpacing from computed style is px — prefer the CSS em default.
  if (getComputedStyle(title).letterSpacing.endsWith("px")) tracking = 0.05;
  let guard = 0;
  while (title.scrollWidth > maxW + 0.5 && size > 16 && guard < 48) {
    size -= 0.5;
    title.style.fontSize = `${size}px`;
    guard += 1;
  }
  while (title.scrollWidth > maxW + 0.5 && tracking > 0.02 && guard < 72) {
    tracking = Math.max(0.02, tracking - 0.01);
    title.style.letterSpacing = `${tracking}em`;
    guard += 1;
  }
}

/**
 * Shrink pitch player counters on narrow boards so discs keep formation spacing.
 * Wide pitches stay at the authored 88×112 size.
 */
export function fitPitchCounters(root: ParentNode): void {
  const pitch = root.querySelector<HTMLElement>(".team-pitch");
  if (!pitch) return;
  const w = pitch.clientWidth;
  if (w < 8) {
    pitch.style.removeProperty("--counter-disc");
    pitch.style.removeProperty("--counter-caption");
    pitch.style.removeProperty("--counter-width");
    return;
  }
  // ~560px pitch ≈ comfortable for 88px discs at MARKER_MIN_DX spacing.
  const scale = Math.min(1, Math.max(0.55, w / 560));
  if (scale >= 0.995) {
    pitch.style.removeProperty("--counter-disc");
    pitch.style.removeProperty("--counter-caption");
    pitch.style.removeProperty("--counter-width");
    return;
  }
  const disc = Math.round(88 * scale);
  const caption = Math.max(12, Math.round(22 * scale));
  const width = Math.round(112 * scale);
  pitch.style.setProperty("--counter-disc", `${disc}px`);
  pitch.style.setProperty("--counter-caption", `${caption}px`);
  pitch.style.setProperty("--counter-width", `${width}px`);
}

export function fitFormationHeaderChips(root: ParentNode): void {
  const title = root.querySelector<HTMLElement>(".char-team-title .eyebrow");
  if (title) fitFormationTeamTitle(title);
  fitPitchCounters(root);
  const bar = root.querySelector<HTMLElement>(".formation-toolbar");
  if (!bar) return;
  const budget = bar.clientWidth || bar.parentElement?.clientWidth || 0;
  if (budget < 8) return;
  const chips = [...bar.querySelectorAll<HTMLElement>(".formation-chip")];
  if (!chips.length) return;
  for (const chip of chips) {
    chip.style.fontSize = "";
    chip.style.paddingLeft = "";
    chip.style.paddingRight = "";
    chip.style.letterSpacing = "";
  }
  let size = parseFloat(getComputedStyle(chips[0]!).fontSize) || 10;
  let pad = 8;
  let tracking = 0.06;
  let guard = 0;
  const over = () => bar.scrollHeight > bar.clientHeight + 2 || bar.scrollWidth > budget + 2;
  while (over() && size > 8 && guard < 48) {
    size -= 0.5;
    pad = Math.max(3, pad - 0.4);
    for (const chip of chips) {
      chip.style.fontSize = `${size}px`;
      chip.style.paddingLeft = `${pad}px`;
      chip.style.paddingRight = `${pad}px`;
    }
    guard += 1;
  }
  while (over() && tracking > 0.02 && guard < 72) {
    tracking = Math.max(0.02, tracking - 0.01);
    for (const chip of chips) chip.style.letterSpacing = `${tracking}em`;
    guard += 1;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Portrait formation layout: own goal at the bottom, attack toward the top. */
const LATERAL_CENTER = 50;
const LATERAL_HALF_SPAN = 44;

export function formationToPitchPercent(x: number, z: number): { left: number; bottom: number } {
  return {
    left: clamp(LATERAL_CENTER + (z / 0.5) * LATERAL_HALF_SPAN, 3, 96),
    bottom: clamp(toDisplayX(x) * 100, 1, 88),
  };
}

/** Minimum centre-to-centre gap so ~88px markers (+ name under) do not overlap (percent of pitch). */
export const MARKER_MIN_DX = 15.5;
export const MARKER_MIN_DY = 19.5;
const MARKER_SEPARATE_ITERS = 10;

export interface PitchMarkerPoint {
  id: string;
  left: number;
  bottom: number;
  /** Goalkeeper stays fixed; other markers are pushed away from overlaps. */
  pinned?: boolean;
}

/**
 * Push outfield markers apart when circles would overlap. GK position is never moved.
 */
export function separatePitchMarkers(points: PitchMarkerPoint[]): Map<string, { left: number; bottom: number }> {
  const nodes = points.map((p) => ({
    id: p.id,
    left: p.left,
    bottom: p.bottom,
    pinned: !!p.pinned,
  }));
  for (let iter = 0; iter < MARKER_SEPARATE_ITERS; iter++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        const dx = b.left - a.left;
        const dy = b.bottom - a.bottom;
        const nx = dx / MARKER_MIN_DX;
        const ny = dy / MARKER_MIN_DY;
        const dist = Math.hypot(nx, ny);
        if (dist >= 1 || dist < 1e-6) {
          if (dist < 1e-6 && !(a.pinned && b.pinned)) {
            // Identical centres: nudge laterally only for unpinned markers.
            const push = 0.55;
            if (!a.pinned && !b.pinned) {
              a.left = clamp(a.left - push * MARKER_MIN_DX, 3, 96);
              b.left = clamp(b.left + push * MARKER_MIN_DX, 3, 96);
              moved = true;
            } else if (!a.pinned) {
              a.left = clamp(a.left - MARKER_MIN_DX, 3, 96);
              moved = true;
            } else if (!b.pinned) {
              b.left = clamp(b.left + MARKER_MIN_DX, 3, 96);
              moved = true;
            }
          }
          continue;
        }
        const overlap = 1 - dist;
        const ux = (nx / dist) * overlap * 0.55;
        const uy = (ny / dist) * overlap * 0.55;
        const shiftL = ux * MARKER_MIN_DX;
        const shiftB = uy * MARKER_MIN_DY;
        if (a.pinned && b.pinned) continue;
        if (a.pinned) {
          b.left = clamp(b.left + shiftL * 2, 3, 96);
          b.bottom = clamp(b.bottom + shiftB * 2, 1, 88);
          moved = true;
        } else if (b.pinned) {
          a.left = clamp(a.left - shiftL * 2, 3, 96);
          a.bottom = clamp(a.bottom - shiftB * 2, 1, 88);
          moved = true;
        } else {
          a.left = clamp(a.left - shiftL, 3, 96);
          a.bottom = clamp(a.bottom - shiftB, 1, 88);
          b.left = clamp(b.left + shiftL, 3, 96);
          b.bottom = clamp(b.bottom + shiftB, 1, 88);
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return new Map(nodes.map((n) => [n.id, { left: n.left, bottom: n.bottom }]));
}

export function pitchPercentToFormation(left: number, bottom: number): { x: number; z: number } {
  return {
    x: fromDisplayX(clamp(bottom / 100, 0.01, 0.92)),
    z: clamp(((left - LATERAL_CENTER) / LATERAL_HALF_SPAN) * 0.5, -0.5, 0.5),
  };
}

/** Join between compressed outfield and pinned attack display. */
const ATTACK_JOIN_X = 0.75;
const ATTACK_JOIN_DISPLAY = 0.575;
const STRIKER_X = 0.82;
const STRIKER_DISPLAY = 0.68;
const GK_JOIN_X = 0.14;
const GK_FLOOR_DISPLAY = 0.008;
const MID_LIFT_LO = 0.38;
const MID_LIFT_HI = 0.68;
const MID_LIFT = 0.034;
/** Slight shared lift for defence + midfield lines. */
const OUTFIELD_LIFT = 0.018;

function outfieldBase(x: number): number {
  const t = clamp((x - 0.02) / (ATTACK_JOIN_X - 0.02), 0, 1);
  return 0.055 + t * (ATTACK_JOIN_DISPLAY - 0.055) + OUTFIELD_LIFT;
}

function withMidLift(x: number, display: number): number {
  if (x < MID_LIFT_LO || x > MID_LIFT_HI) return display;
  const midT = (x - MID_LIFT_LO) / (MID_LIFT_HI - MID_LIFT_LO);
  return display + Math.sin(midT * Math.PI) * MID_LIFT;
}

/** UI-only depth: GK lower, midfield nudged up, strikers unchanged. */
function toDisplayX(x: number): number {
  if (x >= ATTACK_JOIN_X) {
    return ATTACK_JOIN_DISPLAY + ((x - ATTACK_JOIN_X) / (STRIKER_X - ATTACK_JOIN_X)) * (STRIKER_DISPLAY - ATTACK_JOIN_DISPLAY);
  }
  const outfieldAtJoin = outfieldBase(GK_JOIN_X);
  if (x <= GK_JOIN_X) {
    const t = clamp(x / GK_JOIN_X, 0, 1);
    // Steeper ease so the default GK (x≈0.07) sits on the pitch-floor stop.
    const eased = t ** 6;
    return GK_FLOOR_DISPLAY + eased * (outfieldAtJoin - GK_FLOOR_DISPLAY);
  }
  return withMidLift(x, outfieldBase(x));
}

function fromDisplayX(displayX: number): number {
  if (displayX >= ATTACK_JOIN_DISPLAY) {
    return ATTACK_JOIN_X + ((displayX - ATTACK_JOIN_DISPLAY) / (STRIKER_DISPLAY - ATTACK_JOIN_DISPLAY)) * (STRIKER_X - ATTACK_JOIN_X);
  }
  const outfieldAtJoin = outfieldBase(GK_JOIN_X);
  if (displayX <= outfieldAtJoin) {
    const u = clamp((displayX - GK_FLOOR_DISPLAY) / (outfieldAtJoin - GK_FLOOR_DISPLAY), 0, 1);
    return Math.pow(u, 1 / 6) * GK_JOIN_X;
  }
  // Approximate inverse ignoring the small mid / outfield lift (nudge still stays in-band).
  return 0.02 + ((displayX - 0.055 - OUTFIELD_LIFT) / (ATTACK_JOIN_DISPLAY - 0.055)) * (ATTACK_JOIN_X - 0.02);
}

export type ControlMode = "PLAYER" | "TEAM" | "KIT" | "SETUP" | "MITEAM";
export type CharacterSelectContext = "select" | "pause";
export type FormationSide = "home" | "away";
/** When set, Formation swaps PLAYER SELECT for tabletop match settings. */
export type TabletopKind = "FLICK" | "TABLE";

export type FlickSetupDraft = {
  opponent: "AI" | "HUMAN";
  difficulty: "EASY" | "NORMAL" | "HARD" | "EXPERT";
  firstTo: number;
  turnBased: boolean;
};

export type TableSetupDraft = {
  layoutId: "FRENCH_CLASSIC" | "TOURNAMENT_MODERN" | "OPEN_CUSTOM";
  opponent: "AI" | "HUMAN";
  difficulty: "EASY" | "NORMAL" | "HARD" | "EXPERT";
  firstTo: number;
  customMen: [number, number, number, number];
};

export interface TeamSelectSlot {
  slot: string;
  player: SquadPlayer;
}

export type EditedLineup = {
  formation: string;
  /** Dropdown selection — base shape or USER. */
  selection: string;
  playStyle: PlayStyleChoice;
  starters: { playerId: string; slot: string; offsetX?: number; offsetZ?: number }[];
  /** Latest USER snapshot to retain when switching back to a base. */
  userTactics?: TeamTacticsUserSnapshot | null;
};

interface SlotOffset {
  dx: number;
  dz: number;
}

/** Snapshot of one fixture side while HOME/AWAY formation editing is open. */
export type FormationSideDraft = {
  teamId: string;
  teamName: string;
  teamColor: string;
  secondaryColor: string;
  team: TeamRecord | null;
  teamBadge: TeamBadgeSource | null;
  formation: string;
  formationSelection: string;
  playStyle: PlayStyleChoice;
  xi: TeamSelectSlot[];
  bench: SquadPlayer[];
  slotOffsets: Map<string, SlotOffset>;
  userTactics: TeamTacticsUserSnapshot | null;
  userBoardDirty: boolean;
  pauseOriginalStarterIds: Set<string> | null;
  pauseSubsRemaining: number | null;
  /** Per-player origin club looks (unmodified MiTeam). */
  playerClubLooks: Map<string, PlayerCardTeamContext> | null;
};

/** Input for seeding one side of the dual formation editor. */
export type FormationSideConfig = {
  teamName: string;
  starters: SquadPlayer[];
  teamColor?: string;
  formation?: string;
  /** Formation dropdown value — base name or USER. */
  formationSelection?: string;
  roster?: SquadPlayer[];
  starterSlots?: string[];
  secondaryColor?: string;
  team?: TeamRecord | TeamBadgeSource | null;
  playStyle?: PlayStyleId | null;
  slotOffsets?: { slot: string; dx: number; dz: number }[];
  userTactics?: TeamTacticsUserSnapshot | null;
  pauseSubsRemaining?: number | null;
  /** Unmodified MiTeam: origin club colours / name / crest per player. */
  playerClubLooks?: Map<string, PlayerCardTeamContext> | null;
};

interface NudgeState {
  pointerId: number;
  slotId: string;
  playerId: string;
  startClientX: number;
  startClientY: number;
  /** Cursor minus slot anchor at grab (percent), so drag does not jump to cursor centre. */
  grabOffsetLeft: number;
  grabOffsetBottom: number;
  moved: boolean;
  slotEl: HTMLElement;
  pitchEl: HTMLElement;
  originOffset: SlotOffset;
}

export class CharacterSelect {
  readonly root: HTMLElement;
  index = 0;
  players: SquadPlayer[] = [];
  teamName = "";
  teamId = "";
  teamColor = "#007A3D";
  teamSecondaryColor = "#ffffff";
  /** Optional club/nation record for the formation header crest. */
  teamBadge: TeamBadgeSource | null = null;
  controlMode: ControlMode = "TEAM";
  /** When set and the active side is MiTeam, Formation shows the MITEAM settings chip. */
  private miTeamHost: { save: SaveManager; db: GameDatabase } | null = null;
  /** Origin-club card/marker looks while MiTeam identity is still default. */
  private playerClubLooks: Map<string, PlayerCardTeamContext> | null = null;
  /** Prematch character select vs in-match pause formation editor. */
  context: CharacterSelectContext = "select";
  /** Match kick-off vs spot-kick practice (pick a taker on the formation). */
  purpose: "match" | "spot" = "match";
  /**
   * Flickball / Foosball: replace PLAYER SELECT with mode settings.
   * Null for normal football Formation.
   */
  tabletopKind: TabletopKind | null = null;
  flickSetup: FlickSetupDraft = {
    opponent: "AI",
    difficulty: "NORMAL",
    firstTo: 5,
    turnBased: true,
  };
  tableSetup: TableSetupDraft = {
    layoutId: "FRENCH_CLASSIC",
    opponent: "AI",
    difficulty: "NORMAL",
    firstTo: 5,
    customMen: [1, 2, 5, 3],
  };
  /** Fired whenever Formation tabletop settings change (persist into Options). */
  onTabletopSettingsChange: (() => void) | null = null;
  /**
   * Quick Match: Formation-like dual board with an AWAY opposition dropdown.
   * Game rebuilds the away draft when `onOppositionChange` fires.
   */
  quickMatch = false;
  oppositionOptions: { id: string; label: string }[] = [];
  oppositionTeamId = "";
  onOppositionChange: ((teamId: string) => void) | null = null;
  /** Prematch only — AUTO follows clash rules; HOME/AWAY force the strip. */
  kitChoice: KitChoice = "auto";
  /** Opponent home kit for clash preview on the Kit Select row. */
  private opponentHomeKit: TeamKit | null = null;
  /** When true, AUTO wears away on colour clash (user is the away club). */
  private userIsAwaySide = false;
  private teamRecord: TeamRecord | null = null;
  /** Club whose kit choice applies (fixed while switching HOME/AWAY drafts). */
  private userMatchTeam: TeamRecord | null = null;
  formation = "4-2-3-1";
  /** Formation dropdown — a base shape or USER. */
  formationSelection: string = "4-2-3-1";
  /** Retained custom tactics (survives switching to a clean base). */
  userTactics: TeamTacticsUserSnapshot | null = null;
  /** True after swaps / style / nudges — retain as USER when switching to a clean base. */
  private userBoardDirty = false;
  /** Play-style override; Auto = derive at kick-off. */
  playStyle: PlayStyleChoice = "auto";
  /** Shown in pause formation editor (substitutions remaining this match). */
  pauseSubsRemaining: number | null = null;
  /** Starting XI ids when the pause editor opened — used to count pending subs. */
  pauseOriginalStarterIds: Set<string> | null = null;
  /** Snapshot of lineup when pause editor opened — Apply highlights when this differs. */
  private pauseBaseline: string | null = null;
  /** Per-side fingerprints when dual HOME/AWAY pause editing is active. */
  private pauseBaselines: Partial<Record<FormationSide, string>> = {};
  private dirtyApply = false;
  xi: TeamSelectSlot[] = [];
  bench: SquadPlayer[] = [];
  /** Per-slot nudges from formation defaults. */
  slotOffsets = new Map<string, SlotOffset>();
  /** Active fixture side on the formation board. */
  formationSide: FormationSide = "home";
  /** Drafts for HOME/AWAY when both sides are editable. */
  private sideDrafts: Partial<Record<FormationSide, FormationSideDraft>> = {};
  private dragPlayerId: string | null = null;
  private nudge: NudgeState | null = null;
  /** Open squad-list / card editor target (null while viewing the sports card). */
  private editingPlayerId: string | null = null;
  /** True while the player card panel is in EDIT layout. */
  private cardEditing = false;
  /** Unsaved field changes in the card editor. */
  private editDirty = false;
  private imagePaths: string[] = [];
  private imagesLoaded = false;
  /** Persist edits from the Formation squad editor. */
  onSquadPlayerSave: ((edit: SquadPlayerEdit) => void) | null = null;
  /** Hex shape vs six detail bars on the roster card / player panel. */
  private profileView: ProfileStatsMode = "hex";
  /** Sports card flipped to the full-ratings back. */
  private cardFlipped = false;
  /** Cumulative rotateY — left tap adds 180°, right tap subtracts 180°. */
  private cardFlipY = 0;
  /**
   * When true, pitch/bench names and UI help tooltips show on hover.
   * Driven by Options → Display → Info overlays (default off).
   */
  showOverlays = false;
  /** Formation chalk board — draw thick lines on the pitch under player counters. */
  private chalkMode = false;
  /** Normalized 0–1 stroke polylines relative to the pitch box. */
  private chalkStrokes: { x: number; y: number }[][] = [];
  private chalkDraft: { x: number; y: number }[] | null = null;
  private chalkPointerId: number | null = null;
  private fitObserver: ResizeObserver | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "char-select";
    parent.appendChild(this.root);
    this.hide();
    if (typeof ResizeObserver !== "undefined") {
      this.fitObserver = new ResizeObserver(() => {
        fitKitSurnameElements(this.root);
        fitFormationHeaderChips(this.root);
      });
      this.fitObserver.observe(this.root);
    }
    this.root.addEventListener("dragstart", (e) => this.onDragStart(e));
    this.root.addEventListener("dragover", (e) => this.onDragOver(e));
    this.root.addEventListener("drop", (e) => this.onDrop(e));
    this.root.addEventListener("dragend", () => {
      this.dragPlayerId = null;
      this.root.querySelectorAll(".pitch-slot.drag-over, .bench-card.dragging, .pitch-token.dragging").forEach((el) => {
        el.classList.remove("drag-over", "dragging");
      });
    });
    this.root.addEventListener("pointerdown", (e) => this.onPitchPointerDown(e));
    this.root.addEventListener("pointermove", (e) => this.onPitchPointerMove(e));
    this.root.addEventListener("pointerup", (e) => this.onPitchPointerUp(e));
    this.root.addEventListener("pointercancel", (e) => this.onPitchPointerUp(e));
    this.root.addEventListener("change", (e) => {
      if (this.handleMiTeamSettingsChange(e)) return;
      this.onTabletopFieldChange(e);
    });
    this.root.addEventListener("contextmenu", (e) => {
      const chalkBtn = (e.target as HTMLElement).closest<HTMLElement>("[data-char='chalk']");
      if (chalkBtn && this.root.contains(chalkBtn)) {
        e.preventDefault();
        e.stopPropagation();
        this.clearChalk();
        return;
      }
      this.onRosterContextMenu(e);
    });
    this.root.addEventListener("click", (e) => {
      const chalkBtn = (e.target as HTMLElement).closest<HTMLElement>("[data-char='chalk']");
      if (chalkBtn && this.root.contains(chalkBtn)) {
        e.preventDefault();
        e.stopPropagation();
        this.toggleChalkMode();
        return;
      }
      const flip = (e.target as HTMLElement).closest<HTMLElement>("[data-char='card-flip']");
      if (flip && this.root.contains(flip)) {
        e.preventDefault();
        e.stopPropagation();
        const dir = flip.getAttribute("data-dir") === "prev" ? -1 : 1;
        this.stepCardPlayer(dir);
        return;
      }
      const cardAct = (e.target as HTMLElement).closest<HTMLElement>("[data-char='card-edit'], [data-char='card-view'], [data-char='card-save']");
      if (cardAct && this.root.contains(cardAct)) {
        e.preventDefault();
        e.stopPropagation();
        const kind = cardAct.getAttribute("data-char");
        if (kind === "card-edit") void this.enterCardEdit(this.current().player.id);
        else if (kind === "card-view") this.exitCardEdit(false);
        else if (kind === "card-save") this.commitSquadPlayerEdit();
        return;
      }
      const toggle = (e.target as HTMLElement).closest<HTMLElement>("[data-char='profile-toggle']");
      if (toggle && this.root.contains(toggle)) {
        e.preventDefault();
        e.stopPropagation();
        this.toggleProfileView();
        return;
      }
      // Name / card body flips from the tapped side; hex keeps its own toggle above.
      const face = (e.target as HTMLElement).closest<HTMLElement>("[data-char='card-face']");
      if (face && this.root.contains(face) && !this.cardEditing) {
        e.preventDefault();
        e.stopPropagation();
        this.flipCardFromPointer(face, e.clientX);
        return;
      }
      if (this.handleMiTeamSettingsClick(e)) return;
      this.onEditDialogClick(e);
    });
    this.root.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const toggle = (e.target as HTMLElement).closest?.("[data-char='profile-toggle']");
      if (toggle && this.root.contains(toggle as Node)) {
        e.preventDefault();
        this.toggleProfileView();
        return;
      }
      const face = (e.target as HTMLElement).closest?.("[data-char='card-face']") as HTMLElement | null;
      if (face && this.root.contains(face) && !this.cardEditing) {
        e.preventDefault();
        // Keyboard: default to flipping as if the right edge was pushed.
        this.flipCardFromSide("right");
      }
    });
    this.root.addEventListener("input", (e) => this.onCardEditFieldEvent(e));
    this.root.addEventListener("change", (e) => {
      this.onCardEditFieldEvent(e);
      void this.onEditDialogChange(e);
    });
  }

  setSquad(
    teamName: string,
    starters: SquadPlayer[],
    teamColor = "#007A3D",
    options?: {
      formation?: string;
      roster?: SquadPlayer[];
      starterSlots?: string[];
      secondaryColor?: string;
      purpose?: "match" | "spot";
      team?: TeamRecord | TeamBadgeSource | null;
      /** Opponent default kit — used for clash hint + AUTO preview. */
      opponentHomeKit?: TeamKit | null;
      /** User club is the away side for this fixture (AUTO may force away kit). */
      userIsAwaySide?: boolean;
      kitChoice?: KitChoice;
      /** Lineup play-style override; null/absent → Auto. */
      playStyle?: PlayStyleId | null;
      formationSelection?: string;
      userTactics?: TeamTacticsUserSnapshot | null;
      slotOffsets?: { slot: string; dx: number; dz: number }[];
      /** Fixture side this squad represents when dual editing is not used. */
      formationSide?: FormationSide;
      playerClubLooks?: Map<string, PlayerCardTeamContext> | null;
    },
  ): void {
    this.sideDrafts = {};
    this.pauseBaselines = {};
    this.formationSide = options?.formationSide ?? "home";
    this.opponentHomeKit = options?.opponentHomeKit ?? null;
    this.userIsAwaySide = !!options?.userIsAwaySide;
    this.kitChoice = options?.kitChoice ?? "auto";
    this.purpose = options?.purpose ?? "match";
    this.quickMatch = false;
    this.oppositionOptions = [];
    this.oppositionTeamId = "";
    this.editingPlayerId = null;
    this.cardEditing = false;
    this.editDirty = false;
    this.resetCardFlip();
    const draft = this.buildSideDraft({
      teamName,
      starters,
      teamColor,
      formation: options?.formation,
      formationSelection: options?.formationSelection,
      roster: options?.roster,
      starterSlots: options?.starterSlots,
      secondaryColor: options?.secondaryColor,
      team: options?.team,
      playStyle: options?.playStyle,
      slotOffsets: options?.slotOffsets,
      userTactics: options?.userTactics,
      pauseSubsRemaining: this.context === "pause" ? this.pauseSubsRemaining : null,
      playerClubLooks: options?.playerClubLooks,
    });
    this.userMatchTeam = draft.team;
    this.applySideDraft(draft);
    this.controlMode = "TEAM";
    if (this.context === "pause") {
      this.pauseBaseline = this.lineupFingerprint();
      this.pauseBaselines = { [this.formationSide]: this.pauseBaseline };
      this.dirtyApply = false;
    }
  }

  /**
   * Seed HOME + AWAY formation drafts so the board can switch between both sides.
   * `active` is the side shown first (normally the user's fixture side).
   */
  setDualFormationSides(
    sides: { home: FormationSideConfig; away: FormationSideConfig },
    active: FormationSide,
    options?: {
      purpose?: "match" | "spot";
      opponentHomeKit?: TeamKit | null;
      userIsAwaySide?: boolean;
      kitChoice?: KitChoice;
      /** Team whose kit choice / clash rules apply (user club). */
      userMatchTeam?: TeamRecord | null;
      quickMatch?: boolean;
      oppositionOptions?: { id: string; label: string }[];
      oppositionTeamId?: string;
    },
  ): void {
    this.editingPlayerId = null;
    this.cardEditing = false;
    this.editDirty = false;
    this.resetCardFlip();
    this.purpose = options?.purpose ?? "match";
    this.opponentHomeKit = options?.opponentHomeKit ?? null;
    this.userIsAwaySide = !!options?.userIsAwaySide;
    this.kitChoice = options?.kitChoice ?? "auto";
    this.quickMatch = !!options?.quickMatch;
    this.oppositionOptions = options?.oppositionOptions ? [...options.oppositionOptions] : [];
    this.oppositionTeamId = options?.oppositionTeamId ?? sides.away.team?.id ?? "";
    const home = this.buildSideDraft(sides.home);
    const away = this.buildSideDraft(sides.away);
    this.sideDrafts = { home, away };
    this.formationSide = active;
    const userTeam =
      options?.userMatchTeam ??
      (options?.userIsAwaySide ? away.team : home.team) ??
      this.sideDrafts[active]?.team ??
      null;
    this.userMatchTeam = userTeam;
    this.applySideDraft(this.sideDrafts[active]!);
    this.controlMode = "TEAM";
    if (this.context === "pause") {
      this.pauseBaselines = {
        home: this.fingerprintDraft(home),
        away: this.fingerprintDraft(away),
      };
      this.pauseBaseline = this.pauseBaselines[active] ?? null;
      this.dirtyApply = false;
    } else {
      this.pauseBaselines = {};
      this.pauseBaseline = null;
      this.dirtyApply = false;
    }
  }

  /** Replace the AWAY draft after Quick Match opposition change (keeps HOME + active side). */
  replaceAwaySide(config: FormationSideConfig, oppositionTeamId: string): void {
    this.flushActiveDraft();
    const away = this.buildSideDraft(config);
    this.sideDrafts.away = away;
    this.oppositionTeamId = oppositionTeamId;
    if (this.formationSide === "away") this.applySideDraft(away);
    else if (this.sideDrafts.home) this.applySideDraft(this.sideDrafts.home);
  }

  canSwitchFormationSide(): boolean {
    return !!(this.sideDrafts.home && this.sideDrafts.away) && this.purpose !== "spot";
  }

  setFormationSide(side: FormationSide): void {
    if (!this.canSwitchFormationSide() || side === this.formationSide) return;
    if (!this.sideDrafts[side]) return;
    this.flushActiveDraft();
    this.formationSide = side;
    this.applySideDraft(this.sideDrafts[side]!);
    this.clearChalk();
    this.chalkMode = false;
    this.markDirtyIfNeeded();
  }

  /** Flip HOME ↔ AWAY on the single side chip. */
  toggleFormationSide(): void {
    if (!this.canSwitchFormationSide()) return;
    this.setFormationSide(this.formationSide === "home" ? "away" : "home");
  }

  private buildSideDraft(config: FormationSideConfig): FormationSideDraft {
    const teamName = config.teamName;
    const teamColor = config.teamColor ?? "#007A3D";
    const secondaryColor = config.secondaryColor?.trim() || "#ffffff";
    const teamRecord = config.team && "defaultKit" in config.team ? config.team : null;
    const teamBadge: TeamBadgeSource | null = config.team
      ? {
          id: config.team.id,
          name: config.team.name ?? teamName,
          abbreviation: config.team.abbreviation,
          badgeAsset: config.team.badgeAsset,
          primaryColor: config.team.primaryColor ?? teamColor,
          secondaryColor: config.team.secondaryColor ?? secondaryColor,
        }
      : null;
    const formation = normalizeFormationName(config.formation);
    const formationSelection =
      config.formationSelection === USER_FORMATION ? USER_FORMATION : normalizeFormationName(config.formationSelection ?? formation);
    const playStyle = isPlayStyleId(config.playStyle ?? undefined) ? config.playStyle! : "auto";
    const form = getFormation(formation);
    const slots = config.starterSlots;
    let xi: TeamSelectSlot[] = config.starters.slice(0, 11).map((player, i) => ({
      slot: slots?.[i] ?? form[i]?.id ?? `S${i}`,
      player,
    }));
    const mapped = remapPlayersToFormation(
      xi.map((row) => ({
        id: row.player.player.id,
        slot: row.slot,
        isGK: row.player.player.primaryPosition === "GK",
      })),
      formation,
      formation,
    );
    const byId = new Map(config.starters.map((s) => [s.player.id, s]));
    xi = mapped
      .map((row) => {
        const player = byId.get(row.id);
        return player ? { slot: row.slot, player } : null;
      })
      .filter((row): row is TeamSelectSlot => !!row);
    const onIds = new Set(xi.map((x) => x.player.player.id));
    const roster = config.roster?.length ? config.roster : config.starters;
    const bench = roster.filter((s) => !onIds.has(s.player.id));
    const slotOffsets = new Map<string, SlotOffset>();
    for (const off of config.slotOffsets ?? []) {
      if (!off.dx && !off.dz) continue;
      slotOffsets.set(off.slot, {
        dx: clamp(off.dx, -MAX_OFFSET_X, MAX_OFFSET_X),
        dz: clamp(off.dz, -MAX_OFFSET_Z, MAX_OFFSET_Z),
      });
    }
    const pauseOriginalStarterIds =
      this.context === "pause" ? new Set(xi.map((row) => row.player.player.id)) : null;
    return {
      teamId: config.team?.id?.trim() || "",
      teamName,
      teamColor,
      secondaryColor,
      team: teamRecord,
      teamBadge,
      formation,
      formationSelection,
      playStyle,
      xi,
      bench,
      slotOffsets,
      userTactics: config.userTactics ?? null,
      userBoardDirty: false,
      pauseOriginalStarterIds,
      pauseSubsRemaining: config.pauseSubsRemaining ?? null,
      playerClubLooks: config.playerClubLooks ? new Map(config.playerClubLooks) : null,
    };
  }

  private applySideDraft(draft: FormationSideDraft): void {
    this.teamName = draft.teamName;
    this.teamId = draft.teamId;
    this.teamColor = draft.teamColor;
    this.teamSecondaryColor = draft.secondaryColor;
    this.teamRecord = draft.team;
    this.teamBadge = draft.teamBadge;
    this.formation = draft.formation;
    this.formationSelection = draft.formationSelection;
    this.playStyle = draft.playStyle;
    this.userTactics = draft.userTactics;
    this.userBoardDirty = draft.userBoardDirty;
    this.xi = draft.xi.map((row) => ({ slot: row.slot, player: row.player }));
    this.bench = [...draft.bench];
    this.slotOffsets = new Map(draft.slotOffsets);
    this.pauseOriginalStarterIds = draft.pauseOriginalStarterIds
      ? new Set(draft.pauseOriginalStarterIds)
      : null;
    this.pauseSubsRemaining = draft.pauseSubsRemaining;
    this.playerClubLooks = draft.playerClubLooks ? new Map(draft.playerClubLooks) : null;
    if (this.controlMode === "MITEAM" && draft.teamId !== MITEAM_TEAM_ID) {
      this.controlMode = "TEAM";
    }
    this.syncKitMarkerColors();
    this.syncPlayersList();
    this.index = Math.max(
      0,
      this.players.findIndex((p) => p.player.primaryPosition !== "GK"),
    );
    if (this.index < 0) this.index = 0;
  }

  private snapshotLiveDraft(): FormationSideDraft {
    return {
      teamId: this.teamId,
      teamName: this.teamName,
      teamColor: this.teamColor,
      secondaryColor: this.teamSecondaryColor,
      team: this.teamRecord,
      teamBadge: this.teamBadge,
      formation: this.formation,
      formationSelection: this.formationSelection,
      playStyle: this.playStyle,
      xi: this.xi.map((row) => ({ slot: row.slot, player: row.player })),
      bench: [...this.bench],
      slotOffsets: new Map(this.slotOffsets),
      userTactics: this.userTactics,
      userBoardDirty: this.userBoardDirty,
      pauseOriginalStarterIds: this.pauseOriginalStarterIds
        ? new Set(this.pauseOriginalStarterIds)
        : null,
      pauseSubsRemaining: this.pauseSubsRemaining,
      playerClubLooks: this.playerClubLooks ? new Map(this.playerClubLooks) : null,
    };
  }

  private clubLookFor(playerId: string): PlayerCardTeamContext {
    const override = this.playerClubLooks?.get(playerId);
    if (override) return override;
    const badge = this.teamBadge;
    const team: PlayerCardTeamContext["team"] =
      this.teamRecord ??
      (badge?.id
        ? {
            id: badge.id,
            name: badge.name ?? this.teamName,
            abbreviation: badge.abbreviation ?? "",
            badgeAsset: badge.badgeAsset ?? null,
            primaryColor: badge.primaryColor ?? this.teamColor,
            secondaryColor: badge.secondaryColor ?? this.teamSecondaryColor,
          }
        : null);
    return {
      teamName: this.teamName,
      teamColor: this.teamColor,
      teamSecondaryColor: this.teamSecondaryColor,
      team,
    };
  }

  private flushActiveDraft(): void {
    if (!this.sideDrafts.home && !this.sideDrafts.away) return;
    this.sideDrafts[this.formationSide] = this.snapshotLiveDraft();
  }

  private fingerprintDraft(draft: FormationSideDraft): string {
    return JSON.stringify({
      formation: draft.formation,
      selection: draft.formationSelection,
      playStyle: draft.playStyle,
      starters: draft.xi.map((row) => {
        const off = draft.slotOffsets.get(row.slot);
        return {
          id: row.player.player.id,
          slot: row.slot,
          dx: off?.dx ?? 0,
          dz: off?.dz ?? 0,
        };
      }),
    });
  }

  private editedLineupFromDraft(draft: FormationSideDraft): EditedLineup {
    const starters = draft.xi.map((row) => {
      const off = draft.slotOffsets.get(row.slot);
      return {
        playerId: row.player.player.id,
        slot: row.slot,
        ...(off && (off.dx || off.dz) ? { offsetX: off.dx, offsetZ: off.dz } : {}),
      };
    });
    const userTactics =
      draft.formationSelection === USER_FORMATION ||
      draft.slotOffsets.size > 0 ||
      draft.userBoardDirty
        ? snapshotWorkingAsUser({
            formation: draft.formation,
            playStyle: draft.playStyle,
            starters,
          })
        : draft.userTactics;
    return {
      formation: draft.formation,
      selection: draft.formationSelection,
      playStyle: draft.playStyle,
      starters,
      userTactics,
    };
  }

  setPurpose(purpose: "match" | "spot"): void {
    this.purpose = purpose;
    if (purpose === "spot") this.controlMode = "TEAM";
  }

  private lineupFingerprint(): string {
    return JSON.stringify({
      formation: this.formation,
      playStyle: this.playStyle,
      starters: this.xi.map((row) => {
        const off = this.slotOffsets.get(row.slot);
        return {
          id: row.player.player.id,
          slot: row.slot,
          dx: off?.dx ?? 0,
          dz: off?.dz ?? 0,
        };
      }),
    });
  }

  setPlayStyle(choice: PlayStyleChoice): void {
    this.playStyle = choice === "auto" || isPlayStyleId(choice) ? choice : "auto";
    this.userBoardDirty = true;
    this.markDirtyIfNeeded();
  }

  private formationSelectOptions(): string[] {
    const names: string[] = [...FORMATION_NAMES];
    if ((this.userTactics || this.formationSelection === USER_FORMATION) && !names.includes(USER_FORMATION)) {
      names.unshift(USER_FORMATION);
    }
    return names;
  }

  private markDirtyIfNeeded(): void {
    if (this.context !== "pause") {
      this.dirtyApply = false;
      return;
    }
    this.flushActiveDraft();
    if (this.sideDrafts.home || this.sideDrafts.away) {
      let dirty = false;
      for (const side of ["home", "away"] as FormationSide[]) {
        const draft = this.sideDrafts[side];
        const base = this.pauseBaselines[side];
        if (draft && base && this.fingerprintDraft(draft) !== base) dirty = true;
      }
      this.dirtyApply = dirty;
      return;
    }
    if (!this.pauseBaseline) {
      this.dirtyApply = false;
      return;
    }
    this.dirtyApply = this.lineupFingerprint() !== this.pauseBaseline;
  }

  current(): SquadPlayer {
    return this.players[this.index] ?? this.xi[0]?.player ?? this.players[0];
  }

  move(delta: number): void {
    if (!this.players.length) return;
    this.index = (this.index + delta + this.players.length) % this.players.length;
  }

  setControlMode(mode: ControlMode): void {
    if (this.context === "pause" || this.purpose === "spot") {
      // Spot practice / pause stay on the formation panel — PLAYER SELECT is the CTA label.
      this.controlMode = "TEAM";
      return;
    }
    if (mode === "KIT" && !this.showKitUi()) {
      this.controlMode = "TEAM";
      return;
    }
    if (mode === "MITEAM" && !this.showMiTeamUi()) {
      this.controlMode = "TEAM";
      return;
    }
    // Flickball / Foosball: no PLAYER SELECT — map that click to the formation pitch.
    if (this.tabletopKind && mode === "PLAYER") {
      this.controlMode = "TEAM";
      return;
    }
    if (mode === "SETUP" && !this.tabletopKind) {
      this.controlMode = "TEAM";
      return;
    }
    this.controlMode = mode;
  }

  /** Enable MiTeam name / colours / emblem editing from Formation. */
  setMiTeamHost(save: SaveManager, db: GameDatabase): void {
    this.miTeamHost = { save, db };
  }

  clearMiTeamHost(): void {
    this.miTeamHost = null;
    if (this.controlMode === "MITEAM") this.controlMode = "TEAM";
  }

  private showMiTeamUi(): boolean {
    return (
      this.context === "select" &&
      this.purpose === "match" &&
      !!this.miTeamHost &&
      this.teamId === MITEAM_TEAM_ID
    );
  }

  /** Enable Formation tabletop settings (FLICKBALL / FOOSBALL nav); pitch stays default. */
  setTabletopMode(
    kind: TabletopKind | null,
    drafts?: { flick?: Partial<FlickSetupDraft>; table?: Partial<TableSetupDraft> },
  ): void {
    this.tabletopKind = kind;
    if (drafts?.flick) this.flickSetup = { ...this.flickSetup, ...drafts.flick };
    if (drafts?.table) {
      this.tableSetup = {
        ...this.tableSetup,
        ...drafts.table,
        customMen: drafts.table.customMen
          ? ([...(drafts.table.customMen)] as [number, number, number, number])
          : this.tableSetup.customMen,
      };
    }
    // Open on the formation pitch (TEAM); settings stay behind the FLICKBALL/FOOSBALL tab.
    if (kind) {
      if (this.controlMode === "PLAYER" || this.controlMode === "SETUP") this.controlMode = "TEAM";
    } else if (this.controlMode === "SETUP") {
      this.controlMode = "TEAM";
    }
  }

  isTabletopMode(): boolean {
    return this.tabletopKind === "FLICK" || this.tabletopKind === "TABLE";
  }

  setKitChoice(choice: KitChoice): void {
    if (this.context !== "select" || this.purpose !== "match") return;
    this.kitChoice = choice;
    this.syncKitMarkerColors();
  }

  /** Kit the user side will wear for the upcoming match (respects AUTO clash). */
  selectedMatchKit(): TeamKit | null {
    const kitTeam = this.userMatchTeam ?? this.teamRecord;
    if (!kitTeam) return null;
    const clash = !!this.opponentHomeKit && kitsClash(this.opponentHomeKit, kitTeam.defaultKit);
    const forceAway = this.userIsAwaySide && clash;
    return pickTeamKit(kitTeam, this.kitChoice, forceAway);
  }

  private syncKitMarkerColors(): void {
    // Pitch markers follow the side on screen. Only the user's club uses kit-choice clash rules.
    const viewingUserClub =
      !!this.userMatchTeam && this.teamRecord?.id === this.userMatchTeam.id;
    if (viewingUserClub) {
      const kit = this.selectedMatchKit();
      if (kit) {
        this.teamColor = kit.shirt;
        this.teamSecondaryColor = kit.trim || kit.numberColor || this.teamSecondaryColor;
        return;
      }
    }
    const sideKit = this.teamRecord?.defaultKit;
    if (sideKit) {
      this.teamColor = sideKit.shirt;
      this.teamSecondaryColor = sideKit.trim || sideKit.numberColor || this.teamSecondaryColor;
    }
  }

  private showKitUi(): boolean {
    return this.context === "select" && this.purpose === "match" && !!(this.userMatchTeam ?? this.teamRecord);
  }

  /** HOME / AWAY / AUTO — shown on the kit panel team-name line. */
  private kitChoiceChipsHtml(): string {
    const kitTeam = this.userMatchTeam ?? this.teamRecord;
    if (!this.showKitUi() || !kitTeam) return "";
    const home = teamHomeKit(kitTeam);
    const away = teamResolvedAwayKit(kitTeam);
    const clash = !!this.opponentHomeKit && kitsClash(this.opponentHomeKit, kitTeam.defaultKit);
    const forceAway = this.userIsAwaySide && clash;
    const autoKit = pickTeamKit(kitTeam, "auto", forceAway);
    const chip = (id: KitChoice, label: string, kit: TeamKit) => {
      const on = this.kitChoice === id ? "on" : "";
      const src = kit.shirtAsset?.trim() || "";
      const thumb = src
        ? `<img class="kit-chip-thumb" alt="" src="${escapeHtml(src)}" onerror="this.remove()"/>`
        : `<span class="kit-chip-swatch" style="background:${escapeHtml(kit.shirt)};box-shadow:inset 0 0 0 1px ${escapeHtml(kit.trim || kit.numberColor || "#fff")}"></span>`;
      return `<button type="button" class="kit-chip ${on}" data-char="kit" data-kit="${id}"${titleAttr(label)}>${thumb}<span>${label}</span></button>`;
    };
    return `
      <div class="kit-name-chips" role="group" aria-label="Kit choice">
        ${chip("home", "HOME", home)}
        ${chip("away", "AWAY", away)}
        ${chip("auto", "AUTO", autoKit)}
      </div>
    `;
  }

  private kitCardHtml(id: KitChoice, label: string, kit: TeamKit): string {
    const on = this.kitChoice === id ? "on" : "";
    const src = kit.shirtAsset?.trim() || "";
    const art = src
      ? `<img class="kit-card-art" alt="" src="${escapeHtml(src)}" onerror="this.classList.add('missing')"/>`
      : `<div class="kit-card-art kit-card-art-swatch" style="background:${escapeHtml(kit.shirt)};border-color:${escapeHtml(kit.trim || kit.numberColor || "#c5a572")}"></div>`;
    const strip = (name: string, color: string) =>
      `<span class="kit-card-strip"><i style="background:${escapeHtml(color)}"></i>${name}</span>`;
    return `
      <button type="button" class="kit-card ${on}" data-char="kit" data-kit="${id}" aria-pressed="${on ? "true" : "false"}">
        <div class="kit-card-label">${label}</div>
        ${art}
        <div class="kit-card-strips">
          ${strip("Shirt", kit.shirt)}
          ${strip("Shorts", kit.shorts)}
          ${strip("Socks", kit.socks)}
        </div>
      </button>
    `;
  }

  setContext(context: CharacterSelectContext, options?: { subsRemaining?: number | null }): void {
    this.context = context;
    this.pauseSubsRemaining = options?.subsRemaining ?? null;
    if (context === "pause") this.controlMode = "TEAM";
    else {
      this.pauseOriginalStarterIds = null;
      this.pauseSubsRemaining = null;
      this.pauseBaselines = {};
      this.sideDrafts = {};
    }
  }

  setFormation(name: string): void {
    if (name === USER_FORMATION) {
      const user = this.userTactics;
      if (!user?.starters?.length) return;
      this.retainWorkingAsUserIfNeeded();
      this.applyUserTacticsSnapshot(user);
      this.formationSelection = USER_FORMATION;
      this.userBoardDirty = false;
      this.markDirtyIfNeeded();
      return;
    }
    const next = normalizeFormationName(name);
    this.retainWorkingAsUserIfNeeded();
    const from = this.formation;
    this.formation = next;
    this.formationSelection = next;
    this.slotOffsets.clear();
    this.userBoardDirty = false;
    const mapped = remapPlayersToFormation(
      this.xi.map((row) => ({
        id: row.player.player.id,
        slot: row.slot,
        isGK: row.player.player.primaryPosition === "GK",
      })),
      next,
      from,
    );
    const byId = new Map(this.xi.map((row) => [row.player.player.id, row.player]));
    this.xi = mapped.map((row) => ({
      slot: row.slot,
      player: byId.get(row.id)!,
    }));
    this.markDirtyIfNeeded();
  }

  /** Keep the current board as USER before switching to a clean base. */
  private retainWorkingAsUserIfNeeded(): void {
    if (
      this.formationSelection !== USER_FORMATION &&
      this.slotOffsets.size === 0 &&
      !this.userBoardDirty
    ) {
      return;
    }
    this.userTactics = snapshotWorkingAsUser({
      formation: this.formation,
      playStyle: this.playStyle,
      starters: this.xi.map((row) => {
        const off = this.slotOffsets.get(row.slot);
        return {
          playerId: row.player.player.id,
          slot: row.slot,
          ...(off && (off.dx || off.dz) ? { offsetX: off.dx, offsetZ: off.dz } : {}),
        };
      }),
    });
  }

  private applyUserTacticsSnapshot(user: TeamTacticsUserSnapshot): void {
    const formation = normalizeFormationName(user.formation);
    this.formation = formation;
    this.playStyle = isPlayStyleId(user.playStyle ?? undefined) ? user.playStyle! : "auto";
    const pool = [...this.xi.map((r) => r.player), ...this.bench];
    const byId = new Map(pool.map((p) => [p.player.id, p]));
    const nextXi: TeamSelectSlot[] = [];
    const used = new Set<string>();
    for (const starter of user.starters) {
      const player = byId.get(starter.playerId);
      if (!player || used.has(player.player.id)) continue;
      used.add(player.player.id);
      nextXi.push({ slot: starter.slot, player });
    }
    if (nextXi.length < 11) {
      const leftovers = pool
        .filter((p) => !used.has(p.player.id))
        .map((p) => ({
          id: p.player.id,
          slot: p.player.primaryPosition,
          isGK: p.player.primaryPosition === "GK",
        }));
      for (const row of remapPlayersToFormation(leftovers, formation, formation)) {
        if (nextXi.length >= 11) break;
        if (used.has(row.id)) continue;
        const player = byId.get(row.id);
        if (!player) continue;
        used.add(row.id);
        nextXi.push({ slot: row.slot, player });
      }
    }
    if (nextXi.length) {
      this.xi = nextXi.slice(0, 11);
      this.bench = pool.filter((p) => !used.has(p.player.id));
    }
    this.slotOffsets.clear();
    for (const starter of user.starters) {
      if (!starter.offsetX && !starter.offsetZ) continue;
      this.slotOffsets.set(starter.slot, {
        dx: clamp(starter.offsetX ?? 0, -MAX_OFFSET_X, MAX_OFFSET_X),
        dz: clamp(starter.offsetZ ?? 0, -MAX_OFFSET_Z, MAX_OFFSET_Z),
      });
    }
    this.syncPlayersList();
  }

  getEditedLineup(): EditedLineup {
    return this.editedLineupFromDraft(this.snapshotLiveDraft());
  }

  /** Flush the active board and return edits for every seeded fixture side. */
  getEditedLineups(): Partial<Record<FormationSide, EditedLineup>> {
    this.flushActiveDraft();
    if (!this.sideDrafts.home && !this.sideDrafts.away) {
      return { [this.formationSide]: this.getEditedLineup() };
    }
    const out: Partial<Record<FormationSide, EditedLineup>> = {};
    for (const side of ["home", "away"] as FormationSide[]) {
      const draft = this.sideDrafts[side];
      if (draft) out[side] = this.editedLineupFromDraft(draft);
    }
    return out;
  }

  /** Test/helper: set a clamped offset from the formation default for a slot. */
  nudgeSlot(slotId: string, dx: number, dz: number): void {
    this.slotOffsets.set(slotId, {
      dx: clamp(dx, -MAX_OFFSET_X, MAX_OFFSET_X),
      dz: clamp(dz, -MAX_OFFSET_Z, MAX_OFFSET_Z),
    });
    this.formationSelection = USER_FORMATION;
    this.userBoardDirty = true;
    this.retainWorkingAsUserIfNeeded();
    this.markDirtyIfNeeded();
  }

  selectPlayerId(id: string): void {
    const i = this.players.findIndex((p) => p.player.id === id);
    if (i < 0) return;
    if (this.players[this.index]?.player.id !== id) this.resetCardFlip();
    this.index = i;
    // Keep the open editor pointed at the newly selected squad row.
    if (this.cardEditing) {
      this.editingPlayerId = id;
      this.editDirty = false;
    }
  }

  /** Cycle hex (6) → full N-gon → six rating bars, without rebuilding the formation panel. */
  toggleProfileView(): void {
    this.profileView = nextProfileStatsMode(this.profileView);
    this.patchProfileStats();
  }

  setCardFlipped(flipped: boolean): void {
    if (this.cardEditing) return;
    if (!flipped) this.resetCardFlip();
    else if (!this.cardFlipped) this.cardFlipY = 180;
    this.cardFlipped = flipped;
    this.cardFlipY = flipped ? (isPlayerCardShowingBack(this.cardFlipY) ? this.cardFlipY : 180) : 0;
    for (const card of this.root.querySelectorAll<HTMLElement>(".player-card")) {
      applyPlayerCardFlip(card, this.cardFlipY);
    }
  }

  private resetCardFlip(): void {
    this.cardFlipped = false;
    this.cardFlipY = 0;
  }

  private flipCardFromPointer(card: HTMLElement, clientX: number): void {
    this.flipCardFromSide(playerCardFlipSideFromClientX(card, clientX));
  }

  private flipCardFromSide(side: "left" | "right"): void {
    if (this.cardEditing) return;
    this.cardFlipY = nextPlayerCardFlipY(this.cardFlipY, side);
    this.cardFlipped = isPlayerCardShowingBack(this.cardFlipY);
    for (const el of this.root.querySelectorAll<HTMLElement>(".player-card")) {
      applyPlayerCardFlip(el, this.cardFlipY);
    }
  }

  /**
   * Update selection highlight + roster card only.
   * Preserves squad-list scroll and avoids re-creating pitch/bench kit PNGs.
   */
  refreshTeamSelection(): void {
    // Full rebuild while the card editor is open so Details/Stats track the selected row.
    if (this.cardEditing || this.controlMode !== "TEAM") {
      this.render();
      return;
    }
    if (!this.root.querySelector(".char-panel-team")) {
      this.render();
      return;
    }
    const list = this.root.querySelector<HTMLElement>(".team-roster-list");
    const scrollTop = list?.scrollTop ?? 0;
    const selected = this.current();
    const selectedId = selected.player.id;

    for (const row of this.root.querySelectorAll<HTMLElement>(".roster-row[data-id]")) {
      row.classList.toggle("on", row.getAttribute("data-id") === selectedId);
    }
    for (const token of this.root.querySelectorAll<HTMLElement>(".pitch-token[data-id]")) {
      const on = token.getAttribute("data-id") === selectedId;
      token.classList.toggle("on", on);
      token.closest(".pitch-slot")?.classList.toggle("on", on);
    }
    for (const card of this.root.querySelectorAll<HTMLElement>(".bench-card[data-id]")) {
      card.classList.toggle("on", card.getAttribute("data-id") === selectedId);
    }

    const card = this.root.querySelector(".team-roster-card");
    if (card) {
      const a = selected.attrs;
      const look = this.clubLookFor(selected.player.id);
      card.innerHTML = `
        ${portraitHtml(selected.player, selected.shirtNumber, look.teamColor, {
          surnameOnly: true,
          className: "kit-marker-roster",
          textColor: contrastingKitText(look.teamColor, look.teamSecondaryColor),
        })}
        <h3>${selected.shirtNumber}. ${escapeHtml(kitHeadingName(selected.player))}</h3>
        <div class="char-meta">${selected.player.primaryPosition} · OVR ${selected.overall}</div>
        ${profileStatsBlock(a, { compact: true, mode: this.profileView, size: 168 })}
      `;
    }
    const pitchCard = this.root.querySelector(".player-pitch-select");
    if (pitchCard) {
      pitchCard.innerHTML = this.playerSelectPitchInnerHtml(selected);
    }

    if (list) list.scrollTop = scrollTop;
    requestAnimationFrame(() => {
      if (list) list.scrollTop = scrollTop;
      fitKitSurnameElements(this.root);
      fitFormationHeaderChips(this.root);
    });
  }

  private patchProfileStats(): void {
    const hosts = this.root.querySelectorAll<HTMLElement>("[data-char='profile-toggle']");
    if (!hosts.length) {
      this.render();
      return;
    }
    const attrs = this.current().attrs;
    for (const host of hosts) {
      const size = Number(host.getAttribute("data-size") || 148);
      const compact = host.classList.contains("profile-stats-compact");
      host.outerHTML = profileStatsBlock(attrs, {
        compact,
        mode: this.profileView,
        size,
      });
    }
  }

  render(): void {
    setInfoOverlaysEnabled(this.showOverlays);
    const list = this.root.querySelector<HTMLElement>(".team-roster-list");
    const rosterScroll = list?.scrollTop ?? 0;
    this.root.hidden = false;
    // KIT keeps its own panel; PLAYER / SETUP / TEAM all share the formation shell,
    // with PLAYER SELECT and Flick/Foosball settings replacing the pitch area only.
    if (this.controlMode === "KIT") this.renderKit();
    else if (this.controlMode === "MITEAM") this.renderMiTeamSettings();
    else this.renderTeam();
    requestAnimationFrame(() => {
      const restored = this.root.querySelector<HTMLElement>(".team-roster-list");
      if (restored && rosterScroll > 0) restored.scrollTop = rosterScroll;
      this.observePitchFit();
      fitKitSurnameElements(this.root);
      fitFormationHeaderChips(this.root);
    });
  }

  hide(): void {
    this.root.hidden = true;
  }

  dispose(): void {
    this.fitObserver?.disconnect();
    this.fitObserver = null;
    this.root.remove();
  }

  private observePitchFit(): void {
    const pitch = this.root.querySelector(".team-pitch");
    if (!pitch || !this.fitObserver) return;
    this.fitObserver.observe(pitch);
  }

  private teamTitleHtml(label?: string, opts?: { withKitChips?: boolean }): string {
    const text = label ?? this.teamName;
    const badge = this.teamBadge
      ? teamBadgeHtml(
          {
            id: this.teamBadge.id,
            name: this.teamBadge.name ?? this.teamName,
            abbreviation: this.teamBadge.abbreviation,
            badgeAsset: this.teamBadge.badgeAsset,
            primaryColor: this.teamBadge.primaryColor ?? this.teamColor,
            secondaryColor: this.teamBadge.secondaryColor ?? this.teamSecondaryColor,
          },
          { className: "char-team-crest", size: 44 },
        )
      : "";
    const chips = opts?.withKitChips ? this.kitChoiceChipsHtml() : "";
    return `<div class="char-team-title">${badge}<div class="eyebrow">${escapeHtml(text)}</div>${chips}</div>`;
  }

  private playerCardFlipNavHtml(_sp: SquadPlayer): string {
    return `<div class="player-card-flip-nav" role="group" aria-label="Browse squad players">
      <button type="button" class="player-card-flip-btn" data-char="card-flip" data-dir="prev" aria-label="Previous player">‹</button>
      <span class="player-card-flip-spacer" aria-hidden="true"></span>
      <button type="button" class="player-card-flip-btn" data-char="card-flip" data-dir="next" aria-label="Next player">›</button>
    </div>`;
  }

  /** Prev/next through the squad (loops). Keeps EDIT mode on the newly selected player. */
  private stepCardPlayer(delta: number): void {
    if (!this.players.length) return;
    this.move(delta);
    const sp = this.current();
    if (this.cardEditing) {
      this.editingPlayerId = sp.player.id;
      this.editDirty = false;
    }
    this.resetCardFlip();
    this.render();
  }

  private playerCardActionBtnHtml(): string {
    if (this.cardEditing && this.editDirty) {
      return `<button type="button" class="player-card-action primary" data-char="card-save"${titleAttr("Save player changes")}>SAVE</button>`;
    }
    if (this.cardEditing) {
      return `<button type="button" class="player-card-action" data-char="card-view"${titleAttr("Back to player card")}>CARD</button>`;
    }
    return `<button type="button" class="player-card-action" data-char="card-edit"${titleAttr("Edit player details")}>EDIT</button>`;
  }

  private playerCardShellHtml(sp: SquadPlayer, opts: { variant: "select" | "edit" }): string {
    const editing = this.cardEditing || opts.variant === "edit";
    return `<div class="player-card-shell player-card-shell-${editing ? "edit" : "select"}${editing ? " is-editing" : ""}">
      <div class="player-card-shell-head">
        ${this.playerCardActionBtnHtml()}
      </div>
      ${editing ? this.playerCardEditPanelHtml(sp) : this.playerSportsCardHtml(sp, { variant: "select" })}
      ${this.playerCardFlipNavHtml(sp)}
    </div>`;
  }

  private playerCardShirtHtml(sp: SquadPlayer, className = "player-card-shirt"): string {
    const look = this.clubLookFor(sp.player.id);
    const text = contrastingKitText(look.teamColor, look.teamSecondaryColor);
    const surname = kitSurname(sp.player.displayName || sp.player.name);
    return `<div class="${className}" style="background:${escapeAttr(look.teamColor)};color:${escapeAttr(text)}">
      <span class="player-card-shirt-name">${escapeHtml(surname)}</span>
      <span class="player-card-shirt-num">${sp.shirtNumber}</span>
    </div>`;
  }

  private playerCardCrestHtml(sp: SquadPlayer): string {
    const look = this.clubLookFor(sp.player.id);
    const team = look.team;
    if (!team) {
      return `<div class="player-card-crest-fallback" style="background:${escapeAttr(look.teamColor)}"></div>`;
    }
    return teamBadgeHtml(
      {
        id: team.id,
        name: "name" in team ? team.name : look.teamName,
        abbreviation: team.abbreviation,
        badgeAsset: team.badgeAsset,
        primaryColor: team.primaryColor ?? look.teamColor,
        secondaryColor: team.secondaryColor ?? look.teamSecondaryColor,
      },
      { className: "player-card-crest" },
    );
  }

  private playerCardPhotoHtml(sp: SquadPlayer): string {
    const src = portraitAsset(sp.player);
    const crestBlock = `<div class="player-card-photo has-crest"><div class="player-card-crest-host">${this.playerCardCrestHtml(sp)}</div></div>`;
    if (src) {
      // Portrait only in the DOM — crest is swapped in only if the PNG fails to load.
      return `<div class="player-card-photo has-photo" data-crest-fallback="${escapeAttr(encodeURIComponent(crestBlock))}">
        <img class="player-card-portrait" alt="" src="${escapeAttr(src)}" onerror="const box=this.closest('.player-card-photo');const fb=box?.dataset.crestFallback;if(!box||!fb){this.remove();return;}box.outerHTML=decodeURIComponent(fb);"/>
      </div>`;
    }
    return crestBlock;
  }

  private playerCardRatingsHtml(sp: SquadPlayer, editing: boolean): string {
    if (editing) {
      return EDIT_STAT_GROUPS.map((group) => {
        const fields = group.fields
          .map((field) => {
            const raw = sp.attrs[field.key];
            const stored = (sp.player as PlayerAttributes)[field.key];
            const value =
              field.optional && (stored === undefined || stored === null)
                ? ""
                : String(typeof raw === "number" ? raw : stored ?? "");
            const ph = field.optional ? ` placeholder="auto"` : "";
            return `<label class="player-card-stat">${field.label}<input data-edit-stat="${field.key}" type="number" min="1" max="100" value="${escapeAttr(value)}"${ph} /></label>`;
          })
          .join("");
        return `<div class="player-card-stat-group"><div class="player-card-stat-title">${group.title}</div><div class="player-card-stat-grid">${fields}</div></div>`;
      }).join("");
    }
    const spokes = listProfileAttrSpokes(sp.attrs);
    return `<div class="player-card-ratings">
      ${spokes
        .map(
          (s) =>
            `<div class="player-card-rating-row"><span>${escapeHtml(s.label)}</span><b>${s.value}</b><i style="width:${s.value}%"></i></div>`,
        )
        .join("")}
    </div>`;
  }

  /** Flipable sports card for PLAYER SELECT — front: shirt + PNG + hex; back: full ratings. */
  private playerSportsCardHtml(sp: SquadPlayer, _opts: { variant: "select" }): string {
    const flipped = this.cardFlipped;
    const hexSize = 148;
    const look = this.clubLookFor(sp.player.id);
    const teamLabel = formatPlayerCardTeamName(look.teamName) || "TEAM";
    return `<div class="player-card player-card-select${flipped ? " is-flipped" : ""}" data-char="card-face" data-face="${flipped ? "back" : "front"}" style="--card-accent:${escapeAttr(look.teamColor)};--card-flip-y:${this.cardFlipY}deg"${titleAttr("Flip card")} role="button" tabindex="0">
      <div class="player-card-inner">
        <div class="player-card-face player-card-front">
          <div class="player-card-top">
            <em class="player-card-meta-label">POS</em>
            <span class="player-card-team">${escapeHtml(teamLabel)}</span>
            <em class="player-card-meta-label player-card-meta-label-end">OVR</em>
            <span class="player-card-pos-code">${escapeHtml(sp.player.primaryPosition)}</span>
            <span class="player-card-ovr-holo">${Math.round(sp.overall)}</span>
          </div>
          ${this.playerCardPhotoHtml(sp)}
          ${profileStatsBlock(sp.attrs, { mode: this.profileView, size: hexSize })}
          ${this.playerCardShirtHtml(sp)}
        </div>
        <div class="player-card-face player-card-back">
          <div class="player-card-back-head">
            <div class="player-card-back-meta">
              <em class="player-card-meta-label">POS</em>
              <span class="player-card-pos-code">${escapeHtml(sp.player.primaryPosition)}</span>
            </div>
            ${this.playerCardShirtHtml(sp, "player-card-shirt player-card-shirt-back")}
            <div class="player-card-back-meta player-card-back-meta-end">
              <em class="player-card-meta-label player-card-meta-label-end">OVR</em>
              <span class="player-card-ovr-value">${Math.round(sp.overall)}</span>
            </div>
          </div>
          <div class="player-card-back-body">${this.playerCardRatingsHtml(sp, false)}</div>
        </div>
      </div>
    </div>`;
  }

  /** Editable details (first) then statistics — used by EDIT mode / right-click. */
  private playerCardEditPanelHtml(sp: SquadPlayer): string {
    const details = `<section class="player-card-edit-section">
      <h4 class="player-card-edit-section-title">Details</h4>
      <div class="player-card-edit-identity">
        <div class="player-card-edit-portrait-row">
          <div class="player-card-edit-portrait-preview">${this.playerCardPhotoHtml(sp)}</div>
          <div class="player-card-edit-portrait-controls">
            <label>PNG portrait
              <select data-edit-field="portraitAsset"${titleAttr("Portrait from images/")}>${this.portraitOptionsHtml(sp.player.appearance?.portraitAsset?.trim() || "")}</select>
            </label>
            <label class="portrait-upload-btn squad-edit-upload">Upload PNG
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-edit-upload hidden />
            </label>
          </div>
        </div>
        <label>Name <input data-edit-field="name" type="text" value="${escapeAttr(sp.player.name)}" /></label>
        <label>Display name <input data-edit-field="displayName" type="text" value="${escapeAttr(sp.player.displayName || sp.player.name)}" /></label>
        <div class="player-card-edit-row">
          <label>Shirt # <input data-edit-field="shirtNumber" type="number" min="1" max="99" value="${sp.shirtNumber}" /></label>
          <label>Position <select data-edit-field="primaryPosition">${EDIT_POSITIONS.map(
            (pos) =>
              `<option value="${pos}"${pos === sp.player.primaryPosition ? " selected" : ""}>${pos}</option>`,
          ).join("")}</select></label>
        </div>
        <div class="player-card-edit-row">
          <label>Height (cm) <input data-edit-field="heightCm" type="number" min="150" max="220" value="${sp.player.heightCm ?? ""}" placeholder="auto" /></label>
          <label>Weight (kg) <input data-edit-field="weightKg" type="number" min="50" max="120" value="${sp.player.weightKg ?? ""}" placeholder="auto" /></label>
        </div>
      </div>
    </section>`;
    const stats = `<section class="player-card-edit-section">
      <h4 class="player-card-edit-section-title">Statistics</h4>
      ${this.playerCardRatingsHtml(sp, true)}
    </section>`;
    const look = this.clubLookFor(sp.player.id);
    return `<div class="player-card-edit-panel" style="--card-accent:${escapeAttr(look.teamColor)}">${details}${stats}</div>`;
  }

  private playerSelectPitchInnerHtml(sp: SquadPlayer): string {
    return this.playerCardShellHtml(sp, { variant: this.cardEditing ? "edit" : "select" });
  }

  /** Player details shown in the pitch well during PLAYER SELECT. */
  private playerSelectPitchHtml(): string {
    return `
      <div class="pitch-overlay-card player-pitch-select">
        ${this.playerSelectPitchInnerHtml(this.current())}
      </div>
    `;
  }

  /** Flickball / Foosball options shown in the pitch well. */
  private tabletopSetupPitchHtml(): string {
    const kind = this.tabletopKind;
    if (!kind) return "";
    const title = kind === "FLICK" ? "FLICKBALL" : "FOOSBALL";
    const blurb =
      kind === "FLICK"
        ? "Pull back and flick on the real pitch. Set opponent, difficulty, and whether you take turns."
        : "Rod foosball — pick layout, opponent, and first-to. Kits still colour each side.";
    const body = kind === "FLICK" ? this.flickSetupFieldsHtml() : this.tableSetupFieldsHtml();
    return `
      <div class="pitch-overlay-card tabletop-setup">
        <div class="tabletop-setup-kicker">${title} SETUP</div>
        <p class="tabletop-setup-blurb">${blurb}</p>
        ${body}
      </div>
    `;
  }

  private flickSetupFieldsHtml(): string {
    const s = this.flickSetup;
    const diffs = ["EASY", "NORMAL", "HARD", "EXPERT"] as const;
    return `
      <div class="tabletop-fields">
        <label>Opponent
          <select data-tt="flick-opp">
            <option value="AI" ${s.opponent === "AI" ? "selected" : ""}>Computer (AI)</option>
            <option value="HUMAN" ${s.opponent === "HUMAN" ? "selected" : ""}>Hotseat 2P</option>
          </select>
        </label>
        <label>AI difficulty
          <select data-tt="flick-diff" ${s.opponent !== "AI" ? "disabled" : ""}>
            ${diffs
              .map((d) => `<option value="${d}" ${s.difficulty === d ? "selected" : ""}>${d}</option>`)
              .join("")}
          </select>
        </label>
        <label>First to (goals)
          <input data-tt="flick-first" type="number" min="1" max="21" value="${s.firstTo}"/>
        </label>
        <label class="check"><input data-tt="flick-turns" type="checkbox" ${s.turnBased ? "checked" : ""}/> Take turns</label>
        <p class="hint">Off = open play — flick anytime the pitch settles; AI reacts on its difficulty timer.</p>
      </div>
    `;
  }

  private tableSetupFieldsHtml(): string {
    const s = this.tableSetup;
    const diffs = ["EASY", "NORMAL", "HARD", "EXPERT"] as const;
    const custom =
      s.layoutId === "OPEN_CUSTOM"
        ? `<label>Custom men (DEF · MID · ATT)
            <span class="tabletop-men-row">
              <input data-tt="table-men-1" type="number" min="1" max="5" value="${s.customMen[1]}"/>
              <input data-tt="table-men-2" type="number" min="1" max="5" value="${s.customMen[2]}"/>
              <input data-tt="table-men-3" type="number" min="1" max="5" value="${s.customMen[3]}"/>
            </span>
          </label>
          <p class="hint">GK is always 1.</p>`
        : "";
    return `
      <div class="tabletop-fields">
        <label>Table layout
          <select data-tt="table-layout">
            <option value="FRENCH_CLASSIC" ${s.layoutId === "FRENCH_CLASSIC" ? "selected" : ""}>French classic</option>
            <option value="TOURNAMENT_MODERN" ${s.layoutId === "TOURNAMENT_MODERN" ? "selected" : ""}>Tournament modern</option>
            <option value="OPEN_CUSTOM" ${s.layoutId === "OPEN_CUSTOM" ? "selected" : ""}>Open custom</option>
          </select>
        </label>
        ${custom}
        <label>Opponent
          <select data-tt="table-opp">
            <option value="AI" ${s.opponent === "AI" ? "selected" : ""}>Computer (AI)</option>
            <option value="HUMAN" ${s.opponent === "HUMAN" ? "selected" : ""}>Hotseat 2P</option>
          </select>
        </label>
        <label>AI difficulty
          <select data-tt="table-diff" ${s.opponent !== "AI" ? "disabled" : ""}>
            ${diffs
              .map((d) => `<option value="${d}" ${s.difficulty === d ? "selected" : ""}>${d}</option>`)
              .join("")}
          </select>
        </label>
        <label>First to (goals)
          <input data-tt="table-first" type="number" min="1" max="21" value="${s.firstTo}"/>
        </label>
      </div>
    `;
  }

  private onTabletopFieldChange(e: Event): void {
    const el = e.target as HTMLElement | null;
    if (!el || !this.root.contains(el)) return;
    if (el instanceof HTMLSelectElement && el.matches("[data-char='play-style']")) {
      const style = el.value;
      if (
        style === "auto" ||
        style === "possession" ||
        style === "balanced" ||
        style === "counter" ||
        style === "direct" ||
        style === "routeOne"
      ) {
        this.setPlayStyle(style);
        this.render();
      }
      return;
    }
    if (el instanceof HTMLSelectElement && el.matches("[data-char='form']")) {
      const form = el.value;
      if (form === USER_FORMATION || FORMATION_NAMES.includes(form as FormationName)) {
        this.setFormation(form);
        this.render();
      }
      return;
    }
    if (el instanceof HTMLSelectElement && el.matches("[data-char='quick-opp']")) {
      const id = el.value;
      if (id && id !== this.oppositionTeamId) this.onOppositionChange?.(id);
      return;
    }
    const key = el.getAttribute("data-tt");
    if (!key) return;
    if (this.tabletopKind === "FLICK") {
      const s = this.flickSetup;
      if (key === "flick-opp" && el instanceof HTMLSelectElement) {
        s.opponent = el.value === "HUMAN" ? "HUMAN" : "AI";
      } else if (key === "flick-diff" && el instanceof HTMLSelectElement) {
        if (el.value === "EASY" || el.value === "NORMAL" || el.value === "HARD" || el.value === "EXPERT") {
          s.difficulty = el.value;
        }
      } else if (key === "flick-first" && el instanceof HTMLInputElement) {
        s.firstTo = Math.max(1, Math.min(21, Number(el.value) || 5));
      } else if (key === "flick-turns" && el instanceof HTMLInputElement) {
        s.turnBased = el.checked;
      } else return;
      this.onTabletopSettingsChange?.();
      if (key === "flick-opp") this.render();
      return;
    }
    if (this.tabletopKind === "TABLE") {
      const s = this.tableSetup;
      if (key === "table-layout" && el instanceof HTMLSelectElement) {
        if (
          el.value === "FRENCH_CLASSIC" ||
          el.value === "TOURNAMENT_MODERN" ||
          el.value === "OPEN_CUSTOM"
        ) {
          s.layoutId = el.value;
        }
      } else if (key === "table-opp" && el instanceof HTMLSelectElement) {
        s.opponent = el.value === "HUMAN" ? "HUMAN" : "AI";
      } else if (key === "table-diff" && el instanceof HTMLSelectElement) {
        if (el.value === "EASY" || el.value === "NORMAL" || el.value === "HARD" || el.value === "EXPERT") {
          s.difficulty = el.value;
        }
      } else if (key === "table-first" && el instanceof HTMLInputElement) {
        s.firstTo = Math.max(1, Math.min(21, Number(el.value) || 5));
      } else if (key.startsWith("table-men-") && el instanceof HTMLInputElement) {
        const idx = Number(key.slice("table-men-".length));
        if (idx >= 1 && idx <= 3) {
          const next = [...s.customMen] as [number, number, number, number];
          next[0] = 1;
          next[idx] = Math.max(1, Math.min(5, Number(el.value) || 2));
          s.customMen = next;
        }
      } else return;
      this.onTabletopSettingsChange?.();
      if (key === "table-layout" || key === "table-opp") this.render();
    }
  }

  private renderMiTeamSettings(): void {
    if (!this.showMiTeamUi() || !this.miTeamHost) {
      this.controlMode = "TEAM";
      this.renderTeam();
      return;
    }
    const { save, db } = this.miTeamHost;
    applyMiTeamToDb(db, save);
    const team = db.getTeam(MITEAM_TEAM_ID);
    const mt = save.data.miteam;
    const clubName = mt?.clubName?.trim() || MITEAM_DEFAULT_CLUB_NAME;
    const primary = mt?.primaryColor?.trim() || MITEAM_DEFAULT_PRIMARY;
    const secondary = mt?.secondaryColor?.trim() || MITEAM_DEFAULT_SECONDARY;
    const customized = miTeamIdentityCustomized(mt);
    const currentCrest = mt?.badgeAsset?.trim() || MITEAM_DEFAULT_BADGE;
    const crestTiles = miteamCrestChoices(db)
      .map((c) => {
        const on = c.url === currentCrest ? " on" : "";
        return `<button type="button" class="miteam-crest-choice${on}" data-char="miteam-crest-pick" data-crest="${escapeAttr(c.url)}" title="${escapeAttr(c.label)}" aria-label="${escapeAttr(c.label)}">
          <img src="${escapeAttr(assetUrl(c.url))}" alt="" loading="lazy" onerror="this.closest('button')?.remove()" />
        </button>`;
      })
      .join("");
    const kitChip = this.showKitUi()
      ? `<button type="button" class="player-card-action" data-char="mode-kit"${titleAttr("Choose home / away match kit")}>Kit select</button>`
      : "";
    this.root.innerHTML = `
      <div class="char-panel char-panel-miteam">
        <div class="kit-select-head miteam-settings-head">
          ${this.teamTitleHtml(clubName)}
          <div class="formation-toolbar" role="toolbar" aria-label="Formation controls">
            <button type="button" class="formation-chip miteam-chip on" data-char="mode-miteam" aria-pressed="true"${titleAttr("MiTeam name, emblem, and colours")}>MITEAM</button>
            ${
              this.canSwitchFormationSide()
                ? `<button type="button" class="formation-chip form-side-chip ${this.formationSide === "home" ? "on" : ""}" data-char="form-side" data-side="home" aria-pressed="${this.formationSide === "home" ? "true" : "false"}">HOME</button>
            <button type="button" class="formation-chip form-side-chip ${this.formationSide === "away" ? "on" : ""}" data-char="form-side" data-side="away" aria-pressed="${this.formationSide === "away" ? "true" : "false"}">AWAY</button>`
                : ""
            }
          </div>
        </div>
        <div class="miteam-settings-body" aria-label="MiTeam options">
          <div class="miteam-settings-main">
            <section class="miteam-settings-section">
              <div class="miteam-settings-section-head">
                <h3 class="miteam-settings-title">Club emblem</h3>
                <label class="miteam-crest-upload player-card-action">Upload
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-char-miteam-crest-upload hidden />
                </label>
              </div>
              <p class="hint miteam-settings-hint">Scoreboards and the club header use this crest. Keep the GOLACO mark so packed players still show their origin clubs on cards.</p>
              <div class="miteam-settings-crest-grid">${crestTiles}</div>
            </section>
          </div>
          <aside class="miteam-settings-side">
            <div class="miteam-settings-preview">
              ${teamBadgeHtml(team, { className: "char-team-crest miteam-settings-preview-crest", size: 72 })}
              <div class="miteam-settings-preview-meta">
                <div class="miteam-settings-preview-name">${escapeHtml(formatPlayerCardTeamName(clubName))}</div>
                <div class="miteam-settings-preview-status">${
                  customized ? "Custom club identity" : "Origin club cards active"
                }</div>
              </div>
              <div class="miteam-settings-preview-swatches" aria-hidden="true">
                <i style="background:${escapeAttr(primary)}"></i>
                <i style="background:${escapeAttr(secondary)}"></i>
              </div>
            </div>
            <section class="miteam-settings-section">
              <h3 class="miteam-settings-title">Club name</h3>
              <input class="miteam-settings-name" data-char-miteam-name type="text" maxlength="28" value="${escapeAttr(clubName)}" aria-label="MiTeam name" placeholder="MiTeam" />
            </section>
            <section class="miteam-settings-section">
              <h3 class="miteam-settings-title">Club colours</h3>
              <p class="hint miteam-settings-hint">Applies to kits and cards once set. Leave default to keep each player&rsquo;s origin colours.</p>
              <div class="miteam-colour-row miteam-settings-colours">
                <label class="miteam-colour-field">Primary
                  <input type="color" data-char-miteam-primary value="${escapeAttr(primary)}" />
                </label>
                <label class="miteam-colour-field">Secondary
                  <input type="color" data-char-miteam-secondary value="${escapeAttr(secondary)}" />
                </label>
              </div>
            </section>
            <section class="miteam-settings-section miteam-settings-actions">
              <h3 class="miteam-settings-title">Match look</h3>
              <p class="hint miteam-settings-hint">Home and away strips are set in Kit Select. Reset clears name, crest, and colours.</p>
              <div class="miteam-settings-action-row">
                ${kitChip}
                <button type="button" class="player-card-action miteam-settings-reset" data-char="miteam-reset-identity"${titleAttr("Restore default name, clear crest and colours")}>
                  Reset identity
                </button>
              </div>
            </section>
          </aside>
        </div>
        ${this.modeNavHtml("MITEAM")}
      </div>
    `;
  }

  private syncShellFromMiTeamSave(): void {
    if (!this.miTeamHost) return;
    const { save, db } = this.miTeamHost;
    applyMiTeamToDb(db, save);
    const team = db.getTeam(MITEAM_TEAM_ID);
    this.teamName = team.name;
    this.teamColor = team.primaryColor;
    this.teamSecondaryColor = team.secondaryColor;
    this.teamRecord = team;
    this.teamBadge = {
      id: team.id,
      name: team.name,
      abbreviation: team.abbreviation,
      badgeAsset: team.badgeAsset,
      primaryColor: team.primaryColor,
      secondaryColor: team.secondaryColor,
    };
    if (this.userMatchTeam?.id === MITEAM_TEAM_ID) this.userMatchTeam = team;
    // Custom identity clears origin looks; default shell restores them.
    this.playerClubLooks = buildMiTeamPlayerClubLooks(db, save.data.miteam);
    this.syncKitMarkerColors();
  }

  private handleMiTeamSettingsClick(e: MouseEvent): boolean {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-char]");
    if (!t || !this.root.contains(t) || !this.miTeamHost) return false;
    const act = t.getAttribute("data-char");
    if (act === "miteam-crest-pick") {
      e.preventDefault();
      e.stopPropagation();
      const url = t.getAttribute("data-crest") ?? MITEAM_DEFAULT_BADGE;
      setMiTeamBadge(this.miTeamHost.save, this.miTeamHost.db, url === MITEAM_DEFAULT_BADGE ? null : url);
      this.syncShellFromMiTeamSave();
      this.render();
      return true;
    }
    if (act === "miteam-reset-identity") {
      e.preventDefault();
      e.stopPropagation();
      const { save, db } = this.miTeamHost;
      setMiTeamClubName(save, db, MITEAM_DEFAULT_CLUB_NAME);
      setMiTeamColors(save, db, { primaryColor: null, secondaryColor: null });
      setMiTeamBadge(save, db, null);
      this.syncShellFromMiTeamSave();
      this.render();
      return true;
    }
    return false;
  }

  private handleMiTeamSettingsChange(e: Event): boolean {
    if (!this.miTeamHost) return false;
    const t = e.target as HTMLElement;
    const { save, db } = this.miTeamHost;
    if (t.matches("[data-char-miteam-name]")) {
      setMiTeamClubName(save, db, (t as HTMLInputElement).value);
      this.syncShellFromMiTeamSave();
      const preview = this.root.querySelector(".miteam-settings-preview-name");
      const eyebrow = this.root.querySelector(".char-team-title .eyebrow");
      const label = formatPlayerCardTeamName(this.teamName);
      if (preview) preview.textContent = label;
      if (eyebrow) eyebrow.textContent = label;
      return true;
    }
    if (t.matches("[data-char-miteam-primary]")) {
      setMiTeamColors(save, db, { primaryColor: (t as HTMLInputElement).value });
      this.syncShellFromMiTeamSave();
      this.render();
      return true;
    }
    if (t.matches("[data-char-miteam-secondary]")) {
      setMiTeamColors(save, db, { secondaryColor: (t as HTMLInputElement).value });
      this.syncShellFromMiTeamSave();
      this.render();
      return true;
    }
    if (t.matches("[data-char-miteam-crest-upload]")) {
      const input = t as HTMLInputElement;
      const file = input.files?.[0];
      input.value = "";
      if (!file || !file.type.startsWith("image/")) return true;
      if (file.size > 750_000) return true;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result ?? "");
        if (!dataUrl.startsWith("data:image/")) return;
        setMiTeamBadge(save, db, dataUrl);
        this.syncShellFromMiTeamSave();
        this.render();
      };
      reader.readAsDataURL(file);
      return true;
    }
    return false;
  }

  private renderKit(): void {
    const kitTeam = this.userMatchTeam ?? this.teamRecord;
    if (!kitTeam) {
      this.renderTeam();
      return;
    }
    const home = teamHomeKit(kitTeam);
    const away = teamResolvedAwayKit(kitTeam);
    const clash = !!this.opponentHomeKit && kitsClash(this.opponentHomeKit, kitTeam.defaultKit);
    const forceAway = this.userIsAwaySide && clash;
    const autoKit = pickTeamKit(kitTeam, "auto", forceAway);
    const hint = forceAway
      ? "Colour clash — AUTO wears your away strip for this fixture."
      : clash && !this.userIsAwaySide
        ? "Colour clash — the opposition will wear their away strip."
        : "Pick HOME or AWAY, or leave AUTO to switch only when colours clash.";
    const selected = this.selectedMatchKit() ?? autoKit;
    const kitTitle = kitTeam.name || this.teamName;
    this.root.innerHTML = `
      <div class="char-panel char-panel-kit">
        <div class="kit-select-head">
          ${this.teamTitleHtml(kitTitle, { withKitChips: true })}
        </div>
        <div class="kit-select-body">
          <div class="kit-select-main">
            <div class="kit-cards" role="listbox" aria-label="Match kits">
              ${this.kitCardHtml("home", "HOME", home)}
              ${this.kitCardHtml("away", "AWAY", away)}
              ${this.kitCardHtml("auto", "AUTO", autoKit)}
            </div>
            <div class="kit-select-summary">
              <div class="kit-select-summary-label">MATCH KIT</div>
              <div class="kit-select-summary-choice">${
                this.kitChoice === "home" ? "HOME" : this.kitChoice === "away" ? "AWAY" : "AUTO"
              }</div>
              <div class="kit-select-summary-strips">
                <span><i style="background:${escapeHtml(selected.shirt)}"></i>Shirt</span>
                <span><i style="background:${escapeHtml(selected.shorts)}"></i>Shorts</span>
                <span><i style="background:${escapeHtml(selected.socks)}"></i>Socks</span>
              </div>
              <p class="kit-select-hint">${hint}</p>
            </div>
          </div>
          <div class="kit-preview-host" role="img" aria-label="Kit preview on player"></div>
        </div>
        ${this.modeNavHtml("KIT")}
      </div>
    `;
  }

  private renderTeam(): void {
    // Tabletop SETUP and football PLAYER SELECT reuse this shell; only the centre well changes.
    // Flickball / Foosball default to the pitch — never silently jump into SETUP.
    if (this.tabletopKind && this.controlMode === "PLAYER") this.controlMode = "TEAM";
    const form = getFormation(this.formation);
    const bySlot = new Map(this.xi.map((row) => [row.slot, row]));
    const selected = this.current();
    const selectedId = selected.player.id;
    const overlayMode =
      this.purpose !== "spot" &&
      this.context === "select" &&
      (this.controlMode === "PLAYER" || (this.controlMode === "SETUP" && !!this.tabletopKind));
    const spotHint =
      this.purpose === "spot"
        ? `<p class="hint spot-pick-hint">Pick the taker on the pitch or squad list, then SELECT to place the kick.</p>`
        : "";
    const titleLabel = this.teamName;
    const oppositionPicker =
      this.quickMatch && this.oppositionOptions.length
        ? `<label class="formation-select-wrap quick-opp-wrap">
              <span class="visually-hidden">Opposition</span>
              <select class="formation-chip formation-select quick-opp-select on" data-char="quick-opp" aria-label="Opposition">
                ${this.oppositionOptions
                  .map(
                    (o) =>
                      `<option value="${escapeAttr(o.id)}" ${o.id === this.oppositionTeamId ? "selected" : ""}>${escapeHtml(o.label)}</option>`,
                  )
                  .join("")}
              </select>
            </label>`
        : "";
    const pitchWell = overlayMode
      ? `<div class="team-pitch team-pitch-panel" aria-label="${
          this.controlMode === "SETUP" ? "Match settings" : "Player select"
        }">${
          this.controlMode === "SETUP" ? this.tabletopSetupPitchHtml() : this.playerSelectPitchHtml()
        }</div>`
      : `<div class="team-pitch${this.chalkMode ? " chalking" : ""}" aria-label="Formation pitch">
            <span class="pitch-goal-mouth pitch-goal-mouth-own" aria-hidden="true"></span>
            <span class="pitch-goal-mouth pitch-goal-mouth-opp" aria-hidden="true"></span>
            <div class="team-pitch-markings" aria-hidden="true">
              <span class="pitch-penalty pitch-penalty-own"></span>
              <span class="pitch-penalty pitch-penalty-opp"></span>
              <span class="pitch-six pitch-six-own"></span>
              <span class="pitch-six pitch-six-opp"></span>
            </div>
            <canvas class="team-pitch-chalk" aria-hidden="true"></canvas>
            ${(() => {
              const raw = form.map((slot) => {
                const off = this.slotOffsets.get(slot.id) ?? { dx: 0, dz: 0 };
                const pos = formationToPitchPercent(slot.x + off.dx, slot.z + off.dz);
                return {
                  id: slot.id,
                  left: pos.left,
                  bottom: pos.bottom,
                  pinned: slot.id === "GK" || slot.role === "GK",
                };
              });
              const laidOut = separatePitchMarkers(raw);
              return form
                .map((slot) => {
                  const pos = laidOut.get(slot.id) ?? formationToPitchPercent(slot.x, slot.z);
                  const row = bySlot.get(slot.id);
                  if (!row) {
                    return `<div class="pitch-slot empty" data-slot="${slot.id}" style="left:${pos.left}%; bottom:${pos.bottom}%"></div>`;
                  }
                  const p = row.player;
                  const on = p.player.id === selectedId ? "on" : "";
                  const name = escapeHtml(p.player.name);
                  const tip = this.showOverlays ? name : "";
                  const look = this.clubLookFor(p.player.id);
                  return `<div class="pitch-slot ${on}" data-slot="${slot.id}" data-player-id="${p.player.id}" style="left:${pos.left}%; bottom:${pos.bottom}%">
                  <button type="button" class="pitch-token ${on}" data-char="pick" data-id="${p.player.id}" data-player-id="${p.player.id}" data-from-slot="${slot.id}" aria-label="${name}"${tip ? ` title="${tip}"` : ""}>
                    ${kitMarkerHtml(p.player, p.shirtNumber, {
                      ...kitMarkerColors(p.player.primaryPosition, look.teamColor, look.teamSecondaryColor),
                    })}
                  </button>
                </div>`;
                })
                .join("");
            })()}
          </div>`;
    this.root.innerHTML = `
      <div class="char-panel char-panel-team ${this.purpose === "spot" ? "char-panel-spot" : ""}">
        <div class="team-select-head">
          ${this.teamTitleHtml(titleLabel)}
          <div class="formation-toolbar" role="toolbar" aria-label="Formation controls">
            ${
              this.showMiTeamUi()
                ? `<button type="button" class="formation-chip miteam-chip ${this.controlMode === "MITEAM" ? "on" : ""}" data-char="mode-miteam" aria-pressed="${this.controlMode === "MITEAM" ? "true" : "false"}"${titleAttr("MiTeam name, emblem, and colours")}>MITEAM</button>`
                : ""
            }
            ${
              this.canSwitchFormationSide()
                ? `<button type="button" class="formation-chip form-side-chip ${this.formationSide === "home" ? "on" : ""}" data-char="form-side" data-side="home" aria-pressed="${this.formationSide === "home" ? "true" : "false"}">HOME</button>
            <button type="button" class="formation-chip form-side-chip ${this.formationSide === "away" ? "on" : ""}" data-char="form-side" data-side="away" aria-pressed="${this.formationSide === "away" ? "true" : "false"}">AWAY</button>`
                : ""
            }
            ${this.quickMatch && this.formationSide === "away" ? oppositionPicker : ""}
            ${
              overlayMode
                ? ""
                : `<button type="button" class="formation-chip chalk-chip ${this.chalkMode ? "on" : ""}" data-char="chalk"${titleAttr("Chalk — draw on the pitch. Right-click to wipe.")} aria-pressed="${this.chalkMode ? "true" : "false"}">Chalk</button>`
            }
            <label class="formation-select-wrap">
              <span class="visually-hidden">Play style</span>
              <select class="formation-chip formation-select play-style-select on" data-char="play-style" aria-label="Play style">
                ${(["auto", ...PLAY_STYLE_IDS] as PlayStyleChoice[])
                  .map(
                    (id) =>
                      `<option value="${id}" ${id === this.playStyle ? "selected" : ""}>${PLAY_STYLE_LABELS[id]}</option>`,
                  )
                  .join("")}
              </select>
            </label>
            <label class="formation-select-wrap">
              <span class="visually-hidden">Formation</span>
              <select class="formation-chip formation-select form-select on" data-char="form" aria-label="Formation">
                ${this.formationSelectOptions()
                  .map(
                    (name) =>
                      `<option value="${name}" ${name === this.formationSelection ? "selected" : ""}>${name}</option>`,
                  )
                  .join("")}
              </select>
            </label>
          </div>
          ${spotHint}
        </div>
        <div class="team-select-body">
          <aside class="team-roster">
            <div class="team-roster-card">
              ${(() => {
                const look = this.clubLookFor(selected.player.id);
                return `${portraitHtml(selected.player, selected.shirtNumber, look.teamColor, {
                  surnameOnly: true,
                  className: "kit-marker-roster",
                  textColor: contrastingKitText(look.teamColor, look.teamSecondaryColor),
                })}`;
              })()}
              <h3>${selected.shirtNumber}. ${escapeHtml(kitHeadingName(selected.player))}</h3>
              <div class="char-meta">${selected.player.primaryPosition} · OVR ${selected.overall}</div>
              ${profileStatsBlock(selected.attrs, { compact: true, mode: this.profileView, size: 168 })}
            </div>
            <div class="team-roster-list">
              ${this.players
                .map((p) => {
                  const name = kitSurname(p.player.displayName || p.player.name);
                  const active = p.player.id === selectedId ? "on" : "";
                  const ovr = Math.round(p.overall);
                  return `<button type="button" class="roster-row ${active}" data-char="pick" data-id="${p.player.id}"${titleAttr("Left-click select · Right-click edit player")}>
                    <span class="roster-num">${p.shirtNumber}</span>
                    <span class="roster-name">${escapeHtml(name)}</span>
                    <span class="roster-pos">${p.player.primaryPosition}</span>
                    <span class="roster-role">${ovr}</span>
                  </button>`;
                })
                .join("")}
            </div>
          </aside>
          ${pitchWell}
          <aside class="team-bench">
            <div class="team-bench-title">SUBSTITUTES</div>
            <div class="team-bench-list">
              ${this.bench
                .map((p) => {
                  const active = p.player.id === selectedId ? "on" : "";
                  const name = escapeHtml(p.player.name);
                  const nameTip = this.showOverlays ? ` title="${name}"` : "";
                  const look = this.clubLookFor(p.player.id);
                  return `<button type="button" class="bench-card ${active}" draggable="true" data-player-id="${p.player.id}" data-from-slot="" data-char="pick" data-id="${p.player.id}" aria-label="${name}"${nameTip}>
                    ${kitMarkerHtml(p.player, p.shirtNumber, {
                      ...kitMarkerColors(p.player.primaryPosition, look.teamColor, look.teamSecondaryColor),
                      className: "kit-marker-bench",
                    })}
                  </button>`;
                })
                .join("")}
            </div>
          </aside>
        </div>
        ${this.modeNavHtml(this.controlMode === "KIT" ? "TEAM" : this.controlMode)}
      </div>
      ${this.squadEditDialogHtml()}
    `;
    if (!overlayMode) this.paintChalkCanvas();
  }

  toggleChalkMode(): void {
    this.chalkMode = !this.chalkMode;
    if (!this.chalkMode) {
      this.chalkDraft = null;
      this.chalkPointerId = null;
    }
    this.render();
  }

  clearChalk(): void {
    this.chalkStrokes = [];
    this.chalkDraft = null;
    this.chalkPointerId = null;
    this.paintChalkCanvas();
  }

  private chalkPointFromEvent(pitchEl: HTMLElement, e: PointerEvent): { x: number; y: number } | null {
    const rect = pitchEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: clamp((e.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((e.clientY - rect.top) / rect.height, 0, 1),
    };
  }

  private paintChalkCanvas(): void {
    const canvas = this.root.querySelector<HTMLCanvasElement>(".team-pitch-chalk");
    const pitch = this.root.querySelector<HTMLElement>(".team-pitch");
    if (!canvas || !pitch) return;
    const rect = pitch.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    // jsdom has no canvas implementation — skip quietly in tests.
    const getCtx = canvas.getContext?.bind(canvas);
    if (!getCtx) return;
    let ctx: CanvasRenderingContext2D | null = null;
    const err = console.error;
    console.error = () => undefined;
    try {
      ctx = getCtx("2d");
    } catch {
      console.error = err;
      return;
    }
    console.error = err;
    if (!ctx || typeof (ctx as CanvasRenderingContext2D).beginPath !== "function") return;
    ctx.clearRect(0, 0, w, h);
    const strokes = this.chalkDraft ? [...this.chalkStrokes, this.chalkDraft] : this.chalkStrokes;
    for (const stroke of strokes) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(245, 248, 242, 0.82)";
      ctx.lineWidth = Math.max(6, Math.min(w, h) * 0.018);
      ctx.shadowColor = "rgba(255, 255, 255, 0.35)";
      ctx.shadowBlur = 1.2;
      ctx.moveTo(stroke[0]!.x * w, stroke[0]!.y * h);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i]!.x * w, stroke[i]!.y * h);
      }
      ctx.stroke();
      // Soft chalk dust edge.
      ctx.strokeStyle = "rgba(220, 228, 216, 0.35)";
      ctx.lineWidth = Math.max(10, Math.min(w, h) * 0.028);
      ctx.shadowBlur = 0;
      ctx.stroke();
    }
  }

  private squadEditDialogHtml(): string {
    // Inline PLAYER SELECT edit covers the pitch well; overlay is for TEAM mode right-click.
    if (!this.cardEditing || !this.editingPlayerId) return "";
    if (this.controlMode === "PLAYER") return "";
    const sp = this.players.find((p) => p.player.id === this.editingPlayerId);
    if (!sp) return "";
    return `
      <div class="squad-edit-overlay" data-squad-edit="backdrop" role="presentation">
        <div class="squad-edit-dialog squad-edit-card" role="dialog" aria-modal="true" aria-label="Edit player" data-squad-edit="dialog">
          ${this.playerCardShellHtml(sp, { variant: "edit" })}
        </div>
      </div>
    `;
  }

  private portraitOptionsHtml(current: string): string {
    const paths = [...this.imagePaths];
    if (current && !paths.includes(current)) paths.unshift(current);
    const opts = [`<option value="">(none)</option>`];
    for (const path of paths) {
      const selected = path === current ? " selected" : "";
      opts.push(`<option value="${escapeAttr(path)}"${selected}>${escapeHtml(imageLabel(path))}</option>`);
    }
    return opts.join("");
  }

  private onRosterContextMenu(e: MouseEvent): void {
    // Pitch counter → player card (view). Squad list row → editable card.
    const token = (e.target as HTMLElement).closest<HTMLElement>(
      ".pitch-token[data-id], .pitch-slot[data-player-id]",
    );
    if (token && this.root.contains(token)) {
      e.preventDefault();
      const id = token.getAttribute("data-id") || token.getAttribute("data-player-id");
      if (id) this.openPlayerCard(id);
      return;
    }
    const row = (e.target as HTMLElement).closest<HTMLElement>(".roster-row[data-id]");
    if (!row || !this.root.contains(row)) return;
    e.preventDefault();
    const id = row.getAttribute("data-id");
    if (!id) return;
    this.selectPlayerId(id);
    void this.enterCardEdit(id);
  }

  /** Open PLAYER SELECT sports card for a squad member (not edit mode). */
  private openPlayerCard(id: string): void {
    this.selectPlayerId(id);
    this.editingPlayerId = null;
    this.cardEditing = false;
    this.editDirty = false;
    this.resetCardFlip();
    if (this.playerSelectAvailable()) this.controlMode = "PLAYER";
    this.render();
  }

  private playerSelectAvailable(): boolean {
    return this.context !== "pause" && this.purpose !== "spot" && !this.tabletopKind;
  }

  private async enterCardEdit(id: string): Promise<void> {
    this.selectPlayerId(id);
    this.editingPlayerId = id;
    this.cardEditing = true;
    this.editDirty = false;
    this.resetCardFlip();
    // Prefer the PLAYER SELECT card well (EDIT / CARD / SAVE). Overlay only when
    // PLAYER SELECT is unavailable (pause, spot practice, tabletop).
    if (this.playerSelectAvailable()) {
      this.controlMode = "PLAYER";
    } else if (this.controlMode === "KIT") {
      this.controlMode = "TEAM";
    }
    this.render();
    if (!this.imagesLoaded) {
      try {
        this.imagePaths = await listPlayerImages();
      } catch {
        this.imagePaths = [];
      }
      this.imagesLoaded = true;
      if (this.editingPlayerId === id && this.cardEditing) this.render();
    }
  }

  private exitCardEdit(saved: boolean): void {
    this.editingPlayerId = null;
    this.cardEditing = false;
    this.editDirty = false;
    this.resetCardFlip();
    if (!saved) {
      // no-op — discard unsaved field values by re-render from live records
    }
    this.render();
  }

  private markCardEditDirty(): void {
    if (!this.cardEditing || this.editDirty) return;
    this.editDirty = true;
    const btn = this.root.querySelector(".player-card-action");
    if (btn) btn.outerHTML = this.playerCardActionBtnHtml();
  }

  private onCardEditFieldEvent(e: Event): void {
    if (!this.cardEditing) return;
    const t = e.target as HTMLElement | null;
    if (!t) return;
    if (t.closest("[data-edit-field], [data-edit-stat], [data-edit-upload]")) {
      this.markCardEditDirty();
    }
  }

  private onEditDialogClick(e: MouseEvent): void {
    const act = (e.target as HTMLElement).closest<HTMLElement>("[data-squad-edit]");
    if (!act) return;
    const kind = act.getAttribute("data-squad-edit");
    if (kind === "cancel" || kind === "backdrop") {
      e.preventDefault();
      this.exitCardEdit(false);
      return;
    }
    if (kind === "dialog") {
      e.stopPropagation();
      return;
    }
    if (kind !== "save") return;
    e.preventDefault();
    this.commitSquadPlayerEdit();
  }

  private async onEditDialogChange(e: Event): Promise<void> {
    const target = e.target as HTMLElement | null;
    if (!target || !this.editingPlayerId) return;
    const upload = target.closest<HTMLInputElement>("input[data-edit-upload]");
    if (upload?.files?.[0]) {
      try {
        const path = await uploadPlayerImage(upload.files[0]);
        if (!this.imagePaths.includes(path)) this.imagePaths.push(path);
        this.imagePaths.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const sp = this.players.find((p) => p.player.id === this.editingPlayerId);
        if (sp) {
          if (!sp.player.appearance) sp.player.appearance = {};
          sp.player.appearance.portraitAsset = path;
        }
        this.render();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Image upload failed");
      } finally {
        upload.value = "";
      }
      return;
    }
    const select = target.closest<HTMLSelectElement>("select[data-edit-field='portraitAsset']");
    if (select) {
      const sp = this.players.find((p) => p.player.id === this.editingPlayerId);
      if (!sp) return;
      if (!sp.player.appearance) sp.player.appearance = {};
      const value = select.value.trim();
      sp.player.appearance.portraitAsset = value || null;
      const photo = this.root.querySelector(".player-card-edit-portrait-preview .player-card-photo");
      if (photo) photo.outerHTML = this.playerCardPhotoHtml(sp);
      this.markCardEditDirty();
    }
  }

  private commitSquadPlayerEdit(): void {
    const id = this.editingPlayerId ?? this.current().player.id;
    if (!id) return;
    const sp = this.players.find((p) => p.player.id === id);
    if (!sp) {
      this.exitCardEdit(false);
      return;
    }
    const read = (field: string): string => {
      const el = this.root.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-edit-field="${field}"]`);
      return el?.value?.trim() ?? "";
    };
    const numOrNull = (raw: string): number | null => {
      if (!raw) return null;
      const v = Number(raw);
      return Number.isFinite(v) ? v : null;
    };
    const clampAttr = (n: number) => Math.max(1, Math.min(100, Math.round(n)));
    const posRaw = read("primaryPosition") as PositionCode;
    const primaryPosition = EDIT_POSITIONS.includes(posRaw) ? posRaw : sp.player.primaryPosition;
    const stats: SquadPlayerEdit["stats"] = {};
    for (const group of EDIT_STAT_GROUPS) {
      for (const field of group.fields) {
        const el = this.root.querySelector<HTMLInputElement>(`[data-edit-stat="${field.key}"]`);
        const raw = el?.value?.trim() ?? "";
        if (!raw) {
          if (field.optional) stats[field.key] = null;
          continue;
        }
        const v = Number(raw);
        if (!Number.isFinite(v)) continue;
        stats[field.key] = clampAttr(v);
      }
    }
    const heightRaw = numOrNull(read("heightCm"));
    const weightRaw = numOrNull(read("weightKg"));
    const edit: SquadPlayerEdit = {
      playerId: id,
      teamId: this.teamId,
      name: read("name") || sp.player.name,
      displayName: read("displayName") || read("name") || sp.player.displayName,
      shirtNumber: Math.max(1, Math.min(99, Math.round(numOrNull(read("shirtNumber")) ?? sp.shirtNumber))),
      primaryPosition,
      portraitAsset: read("portraitAsset") || null,
      heightCm: heightRaw === null ? null : Math.max(150, Math.min(220, Math.round(heightRaw))),
      weightKg: weightRaw === null ? null : Math.max(50, Math.min(120, Math.round(weightRaw))),
      stats,
    };
    this.applySquadPlayerEditLocally(edit);
    this.onSquadPlayerSave?.(edit);
    this.exitCardEdit(true);
  }

  private applySquadPlayerEditLocally(edit: SquadPlayerEdit): void {
    const patch = (sp: SquadPlayer): void => {
      if (sp.player.id !== edit.playerId) return;
      sp.player.name = edit.name;
      sp.player.displayName = edit.displayName;
      sp.player.primaryPosition = edit.primaryPosition;
      if (!sp.player.appearance) sp.player.appearance = {};
      sp.player.appearance.portraitAsset = edit.portraitAsset;
      if (edit.heightCm == null) delete sp.player.heightCm;
      else sp.player.heightCm = edit.heightCm;
      if (edit.weightKg == null) delete sp.player.weightKg;
      else sp.player.weightKg = edit.weightKg;
      Object.assign(
        sp.player.appearance,
        applyPhysicalToAppearance(sp.player.appearance, edit.heightCm, edit.weightKg),
      );
      for (const [key, value] of Object.entries(edit.stats) as [EditStatKey, number | null][]) {
        if (value == null) delete (sp.player as unknown as Record<string, unknown>)[key];
        else (sp.player as unknown as Record<string, number>)[key] = value;
      }
      sp.membership.shirtNumber = edit.shirtNumber;
      sp.shirtNumber = edit.shirtNumber;
      sp.attrs = { ...sp.attrs, ...sp.player };
      sp.overall = deriveOverall(sp.player.primaryPosition, sp.attrs);
      sp.attrs = { ...sp.attrs, overall: sp.overall };
    };
    for (const sp of this.players) patch(sp);
    for (const row of this.xi) patch(row.player);
    for (const sp of this.bench) patch(sp);
    this.syncPlayersList();
  }

  private modeNavHtml(mode: ControlMode): string {
    if (this.context === "pause") {
      const matchLeft = this.pauseSubsRemaining;
      const pending =
        this.pauseOriginalStarterIds != null
          ? this.xi.filter((row) => !this.pauseOriginalStarterIds!.has(row.player.player.id)).length
          : 0;
      const left = matchLeft == null ? null : Math.max(0, matchLeft - pending);
      const subNote =
        left == null
          ? ""
          : left <= 0
            ? `<p class="hint pause-form-note">No substitutions remaining · you can still change shape and swap starters</p>`
            : `<p class="hint pause-form-note">${left} substitution${left === 1 ? "" : "s"} remaining</p>`;
      return `
      ${subNote}
      <div class="char-nav">
        <button type="button" data-char="pause-back">BACK</button>
        <button type="button" data-char="pause-apply" class="${this.dirtyApply ? "needs-apply" : ""}">APPLY</button>
      </div>
    `;
    }
    if (this.purpose === "spot") {
      const name = kitSurname(this.current().player.displayName || this.current().player.name);
      return `
      <div class="char-modes">
        <button type="button" data-char="mode-team" class="on" aria-pressed="true">TEAM SELECT</button>
      </div>
      <div class="char-nav">
        <button type="button" class="char-nav-step" data-char="prev" aria-label="Previous">‹</button>
        <button type="button" data-char="back">BACK</button>
        <button type="button" data-char="start" class="on primary spot-select-btn">SELECT ${escapeHtml(name).toUpperCase()}</button>
        <button type="button" class="char-nav-step" data-char="next" aria-label="Next">›</button>
      </div>
    `;
    }
    const kitMode = this.showKitUi()
      ? `<button type="button" data-char="mode-kit" class="${mode === "KIT" ? "on" : ""}">KIT SELECT</button>`
      : "";
    if (this.tabletopKind) {
      const setupLabel = this.tabletopKind === "FLICK" ? "FLICKBALL" : "FOOSBALL";
      const startLabel = this.tabletopKind === "FLICK" ? "START FLICKBALL" : "START FOOSBALL";
      return `
      <div class="char-modes">
        <button type="button" data-char="mode-setup" class="${mode === "SETUP" ? "on" : ""}">${setupLabel}</button>
        <button type="button" data-char="mode-team" class="${mode === "TEAM" ? "on" : ""}">TEAM SELECT</button>
        ${kitMode}
      </div>
      <div class="char-nav">
        <button type="button" data-char="back">BACK</button>
        <button type="button" data-char="start" class="primary">${startLabel}</button>
      </div>
    `;
    }
    const startLabel = mode === "PLAYER" ? "START AS PLAYER" : "START AS TEAM";
    return `
      <div class="char-modes">
        <button type="button" data-char="mode-player" class="${mode === "PLAYER" ? "on" : ""}">PLAYER SELECT</button>
        <button type="button" data-char="mode-team" class="${mode === "TEAM" ? "on" : ""}">TEAM SELECT</button>
        ${kitMode}
      </div>
      <div class="char-nav">
        <button type="button" class="char-nav-step" data-char="prev" aria-label="Previous">‹</button>
        <button type="button" data-char="back">BACK</button>
        <button type="button" data-char="start">${startLabel}</button>
        <button type="button" data-char="simulate">SIMULATE</button>
        <button type="button" class="char-nav-step" data-char="next" aria-label="Next">›</button>
      </div>
    `;
  }

  /** Swap a squad player into a named formation slot (bench ↔ XI or XI ↔ XI). */
  placePlayerOnSlot(playerId: string, toSlot: string): void {
    this.swapIntoSlot(playerId, toSlot);
    this.syncPlayersList();
  }

  private onPitchPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    if (this.chalkMode) {
      const pitchEl = (e.target as HTMLElement).closest<HTMLElement>(".team-pitch");
      if (!pitchEl || !this.root.contains(pitchEl)) return;
      e.preventDefault();
      e.stopPropagation();
      const pt = this.chalkPointFromEvent(pitchEl, e);
      if (!pt) return;
      this.chalkPointerId = e.pointerId;
      this.chalkDraft = [pt];
      pitchEl.setPointerCapture(e.pointerId);
      this.paintChalkCanvas();
      return;
    }
    const token = (e.target as HTMLElement).closest<HTMLElement>(".pitch-token");
    if (!token || token.closest(".bench-card")) return;
    const slotEl = token.closest<HTMLElement>(".pitch-slot");
    const pitchEl = token.closest<HTMLElement>(".team-pitch");
    const slotId = slotEl?.getAttribute("data-slot");
    const playerId = token.getAttribute("data-player-id");
    if (!slotEl || !pitchEl || !slotId || !playerId) return;
    e.preventDefault();
    this.selectPlayerId(playerId);
    const origin = this.slotOffsets.get(slotId) ?? { dx: 0, dz: 0 };
    const form = getFormation(this.formation).find((s) => s.id === slotId);
    const rect = pitchEl.getBoundingClientRect();
    let grabOffsetLeft = 0;
    let grabOffsetBottom = 0;
    if (form && rect.width > 0 && rect.height > 0) {
      const anchor = formationToPitchPercent(form.x + origin.dx, form.z + origin.dz);
      const cursorLeft = ((e.clientX - rect.left) / rect.width) * 100;
      const cursorBottom = ((rect.bottom - e.clientY) / rect.height) * 100;
      grabOffsetLeft = cursorLeft - anchor.left;
      grabOffsetBottom = cursorBottom - anchor.bottom;
    }
    this.nudge = {
      pointerId: e.pointerId,
      slotId,
      playerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      grabOffsetLeft,
      grabOffsetBottom,
      moved: false,
      slotEl,
      pitchEl,
      originOffset: { dx: origin.dx, dz: origin.dz },
    };
    // Capture on the pitch (not the slot) so hit-testing other slots still works.
    pitchEl.setPointerCapture(e.pointerId);
    slotEl.classList.add("nudging");
  }

  private onPitchPointerMove(e: PointerEvent): void {
    if (this.chalkMode && this.chalkDraft && e.pointerId === this.chalkPointerId) {
      const pitchEl = this.root.querySelector<HTMLElement>(".team-pitch");
      if (!pitchEl) return;
      e.preventDefault();
      const pt = this.chalkPointFromEvent(pitchEl, e);
      if (!pt) return;
      const last = this.chalkDraft[this.chalkDraft.length - 1]!;
      if (Math.hypot(pt.x - last.x, pt.y - last.y) < 0.004) return;
      this.chalkDraft.push(pt);
      this.paintChalkCanvas();
      return;
    }
    const n = this.nudge;
    if (!n || e.pointerId !== n.pointerId) return;
    const dx = e.clientX - n.startClientX;
    const dy = e.clientY - n.startClientY;
    if (!n.moved && dx * dx + dy * dy < 25) return;
    n.moved = true;
    e.preventDefault();
    const rect = n.pitchEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const left = ((e.clientX - rect.left) / rect.width) * 100 - n.grabOffsetLeft;
    const bottom = ((rect.bottom - e.clientY) / rect.height) * 100 - n.grabOffsetBottom;
    this.applyNudgeFromPercent(n.slotId, left, bottom);
    const off = this.slotOffsets.get(n.slotId) ?? { dx: 0, dz: 0 };
    const form = getFormation(this.formation).find((s) => s.id === n.slotId);
    if (!form) return;
    const pos = formationToPitchPercent(form.x + off.dx, form.z + off.dz);
    n.slotEl.style.left = `${pos.left}%`;
    n.slotEl.style.bottom = `${pos.bottom}%`;

    this.root.querySelectorAll(".pitch-slot.drag-over").forEach((el) => el.classList.remove("drag-over"));
    const targetSlot = this.slotNearPoint(e.clientX, e.clientY, n.slotId);
    targetSlot?.classList.add("drag-over");
  }

  private onPitchPointerUp(e: PointerEvent): void {
    if (this.chalkMode && e.pointerId === this.chalkPointerId) {
      const pitchEl = this.root.querySelector<HTMLElement>(".team-pitch");
      try {
        pitchEl?.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      if (this.chalkDraft && this.chalkDraft.length >= 2) this.chalkStrokes.push(this.chalkDraft);
      this.chalkDraft = null;
      this.chalkPointerId = null;
      this.paintChalkCanvas();
      return;
    }
    const n = this.nudge;
    if (!n || e.pointerId !== n.pointerId) return;
    n.slotEl.classList.remove("nudging");
    this.root.querySelectorAll(".pitch-slot.drag-over").forEach((el) => el.classList.remove("drag-over"));
    try {
      n.pitchEl.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    this.selectPlayerId(n.playerId);
    let structureChanged = false;
    if (n.moved) {
      e.preventDefault();
      e.stopPropagation();
      const targetSlot = this.slotNearPoint(e.clientX, e.clientY, n.slotId);
      const toSlot = targetSlot?.getAttribute("data-slot");
      if (toSlot && toSlot !== n.slotId) {
        this.restoreSlotOffset(n.slotId, n.originOffset);
        this.swapIntoSlot(n.playerId, toSlot);
        this.syncPlayersList();
        this.selectPlayerId(n.playerId);
        structureChanged = true;
      } else {
        this.markDirtyIfNeeded();
        structureChanged = true; // slot offsets / chalk positions need a layout pass
      }
    }
    this.nudge = null;
    if (this.controlMode === "TEAM") {
      if (structureChanged) this.render();
      else this.refreshTeamSelection();
    }
  }

  /** Prefer a nearby occupied slot for swap targeting (avoids pointer-capture hit-test issues). */
  private slotNearPoint(clientX: number, clientY: number, excludeSlotId: string): HTMLElement | null {
    let best: HTMLElement | null = null;
    let bestDist = 44 * 44;
    for (const el of this.root.querySelectorAll<HTMLElement>(".pitch-slot[data-slot]:not(.empty)")) {
      const id = el.getAttribute("data-slot");
      if (!id || id === excludeSlotId) continue;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height * 0.35;
      const d = (clientX - cx) * (clientX - cx) + (clientY - cy) * (clientY - cy);
      if (d < bestDist) {
        bestDist = d;
        best = el;
      }
    }
    return best;
  }

  private restoreSlotOffset(slotId: string, origin: SlotOffset): void {
    if (origin.dx || origin.dz) this.slotOffsets.set(slotId, { dx: origin.dx, dz: origin.dz });
    else this.slotOffsets.delete(slotId);
  }

  private applyNudgeFromPercent(slotId: string, left: number, bottom: number): void {
    const form = getFormation(this.formation).find((s) => s.id === slotId);
    if (!form) return;
    const pos = pitchPercentToFormation(left, bottom);
    this.slotOffsets.set(slotId, {
      dx: clamp(pos.x - form.x, -MAX_OFFSET_X, MAX_OFFSET_X),
      dz: clamp(pos.z - form.z, -MAX_OFFSET_Z, MAX_OFFSET_Z),
    });
  }

  private onDragStart(e: DragEvent): void {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(".bench-card[draggable='true'][data-player-id]");
    if (!btn || !e.dataTransfer) return;
    this.dragPlayerId = btn.getAttribute("data-player-id");
    e.dataTransfer.setData("text/plain", this.dragPlayerId ?? "");
    e.dataTransfer.effectAllowed = "move";
    btn.classList.add("dragging");
  }

  private onDragOver(e: DragEvent): void {
    const slot = (e.target as HTMLElement).closest<HTMLElement>(".pitch-slot");
    if (!slot || !this.dragPlayerId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    this.root.querySelectorAll(".pitch-slot.drag-over").forEach((el) => el.classList.remove("drag-over"));
    slot.classList.add("drag-over");
  }

  private onDrop(e: DragEvent): void {
    e.preventDefault();
    const slotEl = (e.target as HTMLElement).closest<HTMLElement>(".pitch-slot");
    const playerId = this.dragPlayerId ?? e.dataTransfer?.getData("text/plain");
    this.root.querySelectorAll(".pitch-slot.drag-over").forEach((el) => el.classList.remove("drag-over"));
    if (!slotEl || !playerId) return;
    const toSlot = slotEl.getAttribute("data-slot");
    if (!toSlot) return;
    this.swapIntoSlot(playerId, toSlot);
    this.syncPlayersList();
    this.selectPlayerId(playerId);
    this.dragPlayerId = null;
    this.render();
  }

  private swapIntoSlot(playerId: string, toSlot: string): void {
    const targetIdx = this.xi.findIndex((row) => row.slot === toSlot);
    if (targetIdx < 0) return;
    const target = this.xi[targetIdx];
    const fromXi = this.xi.findIndex((row) => row.player.player.id === playerId);
    const fromBench = this.bench.findIndex((p) => p.player.id === playerId);

    if (fromXi >= 0) {
      const moving = this.xi[fromXi];
      this.xi[fromXi] = { slot: moving.slot, player: target.player };
      this.xi[targetIdx] = { slot: toSlot, player: moving.player };
      this.userBoardDirty = true;
      this.markDirtyIfNeeded();
      return;
    }
    if (fromBench < 0) return;
    const incoming = this.bench[fromBench];
    const toIsGk = toSlot === "GK";
    const inIsGk = incoming.player.primaryPosition === "GK";
    if (toIsGk !== inIsGk) return;
    if (
      this.context === "pause" &&
      this.pauseOriginalStarterIds &&
      this.pauseSubsRemaining != null
    ) {
      const pendingAfter = this.xi.filter((row, i) => {
        const id = i === targetIdx ? incoming.player.id : row.player.player.id;
        return !this.pauseOriginalStarterIds!.has(id);
      }).length;
      if (pendingAfter > this.pauseSubsRemaining) return;
    }
    this.bench.splice(fromBench, 1);
    this.bench.push(target.player);
    this.xi[targetIdx] = { slot: toSlot, player: incoming };
    this.userBoardDirty = true;
    this.markDirtyIfNeeded();
  }

  private syncPlayersList(): void {
    const form = getFormation(this.formation);
    const slotById = new Map(this.xi.map((row) => [row.player.player.id, row.slot]));
    const formBySlot = new Map(form.map((slot) => [slot.id, slot]));

    const sortKey = (p: SquadPlayer): [number, number, number, number] => {
      const slot = slotById.get(p.player.id);
      if (slot) {
        const fs = formBySlot.get(slot);
        return [
          0,
          lineBandFromSlot(slot, this.formation),
          sideRankFromSlot(slot, fs?.z ?? 0),
          p.shirtNumber,
        ];
      }
      // Bench: substitute GK stays top; everyone else by shirt number.
      return [
        1,
        p.player.primaryPosition === "GK" ? 0 : 1,
        p.shirtNumber,
        0,
      ];
    };

    const byLine = (a: SquadPlayer, b: SquadPlayer) => {
      const ka = sortKey(a);
      const kb = sortKey(b);
      for (let i = 0; i < ka.length; i++) {
        if (ka[i] !== kb[i]) return ka[i] - kb[i];
      }
      return 0;
    };

    this.bench = [...this.bench].sort(byLine);
    this.players = [...this.xi.map((x) => x.player), ...this.bench].sort(byLine);
    const curId = this.players[this.index]?.player.id;
    const next = curId ? this.players.findIndex((p) => p.player.id === curId) : -1;
    this.index = next >= 0 ? next : 0;
  }
}

