import type { SquadPlayer } from "../core/Database";
import { FORMATION_NAMES, getFormation, remapPlayersToFormation } from "../football/teams/Formation";
import type { KitChoice, PlayerAttributes, PositionCode, TeamKit, TeamRecord } from "../data/schema";
import {
  PLAY_STYLE_IDS,
  PLAY_STYLE_LABELS,
  isPlayStyleId,
  type PlayStyleChoice,
  type PlayStyleId,
} from "../football/ai/PlayStyle";
import { kitsClash, pickTeamKit, teamHomeKit, teamResolvedAwayKit } from "../football/teams/KitClash";
import { applyPhysicalToAppearance } from "../football/players/PlayerStats";
import { fitKitSurnameElements, kitMarkerHtml, portraitHtml, teamBadgeHtml } from "./Portrait";
import { contrastingKitText } from "./kitContrast";
import { imageLabel, listPlayerImages, uploadPlayerImage } from "./playerImages";
import { profileStatsBlock } from "./ProfileHex";

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

const GROUPS = ["GK", "DEF", "MID", "FWD"] as const;
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

function groupOf(pos: string): (typeof GROUPS)[number] {
  if (pos === "GK") return "GK";
  if (["CB", "RB", "LB", "RWB", "LWB"].includes(pos)) return "DEF";
  if (["ST", "RW", "LW"].includes(pos)) return "FWD";
  return "MID";
}

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

function lineBandFromPosition(pos: string): number {
  if (pos === "GK") return LINE_BAND.GK;
  if (pos === "RB" || pos === "RWB") return LINE_BAND.RB;
  if (pos === "CB") return LINE_BAND.CB;
  if (pos === "LB" || pos === "LWB") return LINE_BAND.LB;
  if (pos === "RM") return LINE_BAND.RM;
  if (pos === "LM") return LINE_BAND.LM;
  if (pos === "RW") return LINE_BAND.RM;
  if (pos === "LW") return LINE_BAND.LM;
  if (pos === "ST" || pos === "CF") return LINE_BAND.ST;
  return LINE_BAND.CM;
}

/** Right (0) → centre (1) → left (2). */
function sideRankFromSlot(slot: string, z: number): number {
  if (slot.startsWith("R") || z > 0.05) return 0;
  if (slot.startsWith("L") || z < -0.05) return 2;
  return 1;
}

function sideRankFromPosition(pos: string): number {
  if (pos.startsWith("R")) return 0;
  if (pos.startsWith("L")) return 2;
  return 1;
}

function kitSurname(name: string): string {
  const parts = name.replace(/\./g, " ").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "PLAYER";
  return parts[parts.length - 1].toUpperCase();
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
    const eased = t * t * t * t;
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
    return Math.pow(u, 0.25) * GK_JOIN_X;
  }
  // Approximate inverse ignoring the small mid / outfield lift (nudge still stays in-band).
  return 0.02 + ((displayX - 0.055 - OUTFIELD_LIFT) / (ATTACK_JOIN_DISPLAY - 0.055)) * (ATTACK_JOIN_X - 0.02);
}

export type ControlMode = "PLAYER" | "TEAM" | "KIT";
export type CharacterSelectContext = "select" | "pause";
export type FormationSide = "home" | "away";

export interface TeamSelectSlot {
  slot: string;
  player: SquadPlayer;
}

export type EditedLineup = {
  formation: string;
  playStyle: PlayStyleChoice;
  starters: { playerId: string; slot: string; offsetX?: number; offsetZ?: number }[];
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
  playStyle: PlayStyleChoice;
  xi: TeamSelectSlot[];
  bench: SquadPlayer[];
  slotOffsets: Map<string, SlotOffset>;
  pauseOriginalStarterIds: Set<string> | null;
  pauseSubsRemaining: number | null;
};

/** Input for seeding one side of the dual formation editor. */
export type FormationSideConfig = {
  teamName: string;
  starters: SquadPlayer[];
  teamColor?: string;
  formation?: string;
  roster?: SquadPlayer[];
  starterSlots?: string[];
  secondaryColor?: string;
  team?: TeamRecord | TeamBadgeSource | null;
  playStyle?: PlayStyleId | null;
  slotOffsets?: { slot: string; dx: number; dz: number }[];
  pauseSubsRemaining?: number | null;
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
  /** Prematch character select vs in-match pause formation editor. */
  context: CharacterSelectContext = "select";
  /** Match kick-off vs spot-kick practice (pick a taker on the formation). */
  purpose: "match" | "spot" = "match";
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
  /** Open squad-list right-click editor (null while closed). */
  private editingPlayerId: string | null = null;
  private imagePaths: string[] = [];
  private imagesLoaded = false;
  /** Persist edits from the Formation squad editor. */
  onSquadPlayerSave: ((edit: SquadPlayerEdit) => void) | null = null;
  /** Hex shape vs six detail bars on the roster card / player panel. */
  private profileView: "hex" | "detail" = "hex";
  /**
   * When true, pitch/bench counters show native hover titles with the player name.
   * Driven by Options → Display → Formation overlays (default off).
   */
  showOverlays = false;
  /** Formation chalk board — draw thick lines on the pitch under player counters. */
  private chalkMode = false;
  /** Normalized 0–1 stroke polylines relative to the pitch box. */
  private chalkStrokes: { x: number; y: number }[][] = [];
  private chalkDraft: { x: number; y: number }[] | null = null;
  private chalkPointerId: number | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "char-select";
    parent.appendChild(this.root);
    this.hide();
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
      const toggle = (e.target as HTMLElement).closest<HTMLElement>("[data-char='profile-toggle']");
      if (toggle && this.root.contains(toggle)) {
        e.preventDefault();
        e.stopPropagation();
        this.toggleProfileView();
        return;
      }
      this.onEditDialogClick(e);
    });
    this.root.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const toggle = (e.target as HTMLElement).closest?.("[data-char='profile-toggle']");
      if (!toggle || !this.root.contains(toggle as Node)) return;
      e.preventDefault();
      this.toggleProfileView();
    });
    this.root.addEventListener("change", (e) => void this.onEditDialogChange(e));
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
      /** Fixture side this squad represents when dual editing is not used. */
      formationSide?: FormationSide;
    },
  ): void {
    this.sideDrafts = {};
    this.pauseBaselines = {};
    this.formationSide = options?.formationSide ?? "home";
    this.opponentHomeKit = options?.opponentHomeKit ?? null;
    this.userIsAwaySide = !!options?.userIsAwaySide;
    this.kitChoice = options?.kitChoice ?? "auto";
    this.purpose = options?.purpose ?? "match";
    this.editingPlayerId = null;
    const draft = this.buildSideDraft({
      teamName,
      starters,
      teamColor,
      formation: options?.formation,
      roster: options?.roster,
      starterSlots: options?.starterSlots,
      secondaryColor: options?.secondaryColor,
      team: options?.team,
      playStyle: options?.playStyle,
      pauseSubsRemaining: this.context === "pause" ? this.pauseSubsRemaining : null,
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
    },
  ): void {
    this.editingPlayerId = null;
    this.purpose = options?.purpose ?? "match";
    this.opponentHomeKit = options?.opponentHomeKit ?? null;
    this.userIsAwaySide = !!options?.userIsAwaySide;
    this.kitChoice = options?.kitChoice ?? "auto";
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
    const formation = config.formation ?? "4-2-3-1";
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
      playStyle,
      xi,
      bench,
      slotOffsets,
      pauseOriginalStarterIds,
      pauseSubsRemaining: config.pauseSubsRemaining ?? null,
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
    this.playStyle = draft.playStyle;
    this.xi = draft.xi.map((row) => ({ slot: row.slot, player: row.player }));
    this.bench = [...draft.bench];
    this.slotOffsets = new Map(draft.slotOffsets);
    this.pauseOriginalStarterIds = draft.pauseOriginalStarterIds
      ? new Set(draft.pauseOriginalStarterIds)
      : null;
    this.pauseSubsRemaining = draft.pauseSubsRemaining;
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
      playStyle: this.playStyle,
      xi: this.xi.map((row) => ({ slot: row.slot, player: row.player })),
      bench: [...this.bench],
      slotOffsets: new Map(this.slotOffsets),
      pauseOriginalStarterIds: this.pauseOriginalStarterIds
        ? new Set(this.pauseOriginalStarterIds)
        : null,
      pauseSubsRemaining: this.pauseSubsRemaining,
    };
  }

  private flushActiveDraft(): void {
    if (!this.sideDrafts.home && !this.sideDrafts.away) return;
    this.sideDrafts[this.formationSide] = this.snapshotLiveDraft();
  }

  private fingerprintDraft(draft: FormationSideDraft): string {
    return JSON.stringify({
      formation: draft.formation,
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
    return {
      formation: draft.formation,
      playStyle: draft.playStyle,
      starters: draft.xi.map((row) => {
        const off = draft.slotOffsets.get(row.slot);
        return {
          playerId: row.player.player.id,
          slot: row.slot,
          ...(off && (off.dx || off.dz) ? { offsetX: off.dx, offsetZ: off.dz } : {}),
        };
      }),
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
    this.markDirtyIfNeeded();
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
    this.controlMode = mode;
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
      return `<button type="button" class="kit-chip ${on}" data-char="kit" data-kit="${id}" title="${escapeHtml(label)}">${thumb}<span>${label}</span></button>`;
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
    const from = this.formation;
    this.formation = name;
    this.slotOffsets.clear();
    const mapped = remapPlayersToFormation(
      this.xi.map((row) => ({
        id: row.player.player.id,
        slot: row.slot,
        isGK: row.player.player.primaryPosition === "GK",
      })),
      name,
      from,
    );
    const byId = new Map(this.xi.map((row) => [row.player.player.id, row.player]));
    this.xi = mapped.map((row) => ({
      slot: row.slot,
      player: byId.get(row.id)!,
    }));
    this.markDirtyIfNeeded();
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
    this.markDirtyIfNeeded();
  }

  selectPlayerId(id: string): void {
    const i = this.players.findIndex((p) => p.player.id === id);
    if (i >= 0) this.index = i;
  }

  /** Toggle hex shape ↔ six ratings without rebuilding the formation panel. */
  toggleProfileView(): void {
    this.profileView = this.profileView === "hex" ? "detail" : "hex";
    this.patchProfileStats();
  }

  /**
   * Update selection highlight + roster card only.
   * Preserves squad-list scroll and avoids re-creating pitch/bench kit PNGs.
   */
  refreshTeamSelection(): void {
    if (this.controlMode !== "TEAM") {
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
      card.innerHTML = `
        ${portraitHtml(selected.player, selected.shirtNumber, this.teamColor, {
          textColor: contrastingKitText(this.teamColor, this.teamSecondaryColor),
        })}
        <h3>${selected.shirtNumber}. ${escapeHtml(selected.player.name)}</h3>
        <div class="char-meta">${selected.player.primaryPosition} · OVR ${selected.overall}</div>
        ${profileStatsBlock(a, { compact: true, mode: this.profileView, size: 168 })}
      `;
    }

    if (list) list.scrollTop = scrollTop;
    requestAnimationFrame(() => {
      if (list) list.scrollTop = scrollTop;
      fitKitSurnameElements(this.root);
    });
  }

  private patchProfileStats(): void {
    const host = this.root.querySelector<HTMLElement>("[data-char='profile-toggle']");
    if (!host) {
      this.render();
      return;
    }
    const size = Number(host.getAttribute("data-size") || (this.controlMode === "TEAM" ? 168 : 188));
    const compact = host.classList.contains("profile-stats-compact");
    const next = profileStatsBlock(this.current().attrs, {
      compact,
      mode: this.profileView,
      size,
    });
    host.outerHTML = next;
  }

  render(): void {
    const list = this.root.querySelector<HTMLElement>(".team-roster-list");
    const rosterScroll = list?.scrollTop ?? 0;
    this.root.hidden = false;
    if (this.controlMode === "KIT") this.renderKit();
    else if (this.controlMode === "TEAM") this.renderTeam();
    else this.renderPlayer();
    requestAnimationFrame(() => {
      const restored = this.root.querySelector<HTMLElement>(".team-roster-list");
      if (restored && rosterScroll > 0) restored.scrollTop = rosterScroll;
      fitKitSurnameElements(this.root);
    });
  }

  hide(): void {
    this.root.hidden = true;
  }

  dispose(): void {
    this.root.remove();
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
          { className: "char-team-crest", size: 28 },
        )
      : "";
    const chips = opts?.withKitChips ? this.kitChoiceChipsHtml() : "";
    return `<div class="char-team-title">${badge}<div class="eyebrow">${escapeHtml(text)}</div>${chips}</div>`;
  }

  private renderPlayer(): void {
    const p = this.current();
    const a = p.attrs;
    this.root.innerHTML = `
      <div class="char-panel char-panel-player">
        ${this.teamTitleHtml()}
        ${portraitHtml(p.player, p.shirtNumber, this.teamColor)}
        <div class="char-num">#${p.shirtNumber}</div>
        <h2>${escapeHtml(p.player.name)}</h2>
        <div class="char-meta">${p.player.primaryPosition} · OVR ${p.overall} · ${groupOf(p.player.primaryPosition)}</div>
        ${profileStatsBlock(a, { mode: this.profileView, size: 168 })}
        ${this.modeNavHtml("PLAYER")}
      </div>
    `;
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
    const form = getFormation(this.formation);
    const bySlot = new Map(this.xi.map((row) => [row.slot, row]));
    const selected = this.current();
    const a = selected.attrs;
    const selectedId = selected.player.id;
    const spotHint =
      this.purpose === "spot"
        ? `<p class="hint spot-pick-hint">Select the taker on the pitch or squad list, then confirm with the highlighted button.</p>`
        : "";
    const titleLabel =
      this.purpose === "spot" ? `Spot-kick Practice · ${this.teamName}` : this.teamName;
    this.root.innerHTML = `
      <div class="char-panel char-panel-team ${this.purpose === "spot" ? "char-panel-spot" : ""}">
        <div class="team-select-head">
          ${this.teamTitleHtml(titleLabel)}
          <div class="play-style-chips" role="group" aria-label="Play style">
            ${
              this.canSwitchFormationSide()
                ? `<div class="form-side-chips" role="group" aria-label="Fixture side">
              <button type="button" class="formation-chip form-side-chip ${this.formationSide === "home" ? "on" : ""}" data-char="form-side" data-side="home" aria-pressed="${this.formationSide === "home" ? "true" : "false"}">HOME</button>
              <button type="button" class="formation-chip form-side-chip ${this.formationSide === "away" ? "on" : ""}" data-char="form-side" data-side="away" aria-pressed="${this.formationSide === "away" ? "true" : "false"}">AWAY</button>
            </div>`
                : ""
            }
            <button type="button" class="formation-chip chalk-chip ${this.chalkMode ? "on" : ""}" data-char="chalk" title="Chalk — draw on the pitch. Right-click to wipe." aria-pressed="${this.chalkMode ? "true" : "false"}">Chalk</button>
            ${(["auto", ...PLAY_STYLE_IDS] as PlayStyleChoice[])
              .map(
                (id) =>
                  `<button type="button" class="formation-chip play-style-chip ${id === this.playStyle ? "on" : ""}" data-char="play-style" data-style="${id}">${PLAY_STYLE_LABELS[id]}</button>`,
              )
              .join("")}
          </div>
          <div class="formation-chips">
            ${FORMATION_NAMES.map(
              (name) =>
                `<button type="button" class="formation-chip ${name === this.formation ? "on" : ""}" data-char="form" data-form="${name}">${name}</button>`,
            ).join("")}
          </div>
          ${spotHint}
        </div>
        <div class="team-select-body">
          <aside class="team-roster">
            <div class="team-roster-card">
              ${portraitHtml(selected.player, selected.shirtNumber, this.teamColor, {
                textColor: contrastingKitText(this.teamColor, this.teamSecondaryColor),
              })}
              <h3>${selected.shirtNumber}. ${escapeHtml(selected.player.name)}</h3>
              <div class="char-meta">${selected.player.primaryPosition} · OVR ${selected.overall}</div>
              ${profileStatsBlock(a, { compact: true, mode: this.profileView, size: 168 })}
            </div>
            <div class="team-roster-title">SQUAD <span class="team-roster-hint">Right-click to edit</span></div>
            <div class="team-roster-list">
              ${this.players
                .map((p) => {
                  const name = kitSurname(p.player.displayName || p.player.name);
                  const active = p.player.id === selectedId ? "on" : "";
                  const ovr = Math.round(p.overall);
                  return `<button type="button" class="roster-row ${active}" data-char="pick" data-id="${p.player.id}" title="Left-click select · Right-click edit">
                    <span class="roster-num">${p.shirtNumber}</span>
                    <span class="roster-name">${escapeHtml(name)}</span>
                    <span class="roster-pos">${p.player.primaryPosition}</span>
                    <span class="roster-role">${ovr}</span>
                  </button>`;
                })
                .join("")}
            </div>
          </aside>
          <div class="team-pitch${this.chalkMode ? " chalking" : ""}" aria-label="Formation pitch">
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
                  const selected = p.player.id === selectedId ? "on" : "";
                  const name = escapeHtml(p.player.name);
                  const nameTip = this.showOverlays ? ` title="${name}"` : "";
                  return `<div class="pitch-slot ${selected}" data-slot="${slot.id}" data-player-id="${p.player.id}" style="left:${pos.left}%; bottom:${pos.bottom}%">
                  <button type="button" class="pitch-token ${selected}" data-char="pick" data-id="${p.player.id}" data-player-id="${p.player.id}" data-from-slot="${slot.id}" aria-label="${name}"${nameTip}>
                    ${kitMarkerHtml(p.player, p.shirtNumber, {
                      ...kitMarkerColors(p.player.primaryPosition, this.teamColor, this.teamSecondaryColor),
                    })}
                  </button>
                </div>`;
                })
                .join("");
            })()}
          </div>
          <aside class="team-bench">
            <div class="team-bench-title">SUBSTITUTES</div>
            <div class="team-bench-list">
              ${this.bench
                .map((p) => {
                  const active = p.player.id === selectedId ? "on" : "";
                  const name = escapeHtml(p.player.name);
                  const nameTip = this.showOverlays ? ` title="${name}"` : "";
                  return `<button type="button" class="bench-card ${active}" draggable="true" data-player-id="${p.player.id}" data-from-slot="" data-char="pick" data-id="${p.player.id}" aria-label="${name}"${nameTip}>
                    ${kitMarkerHtml(p.player, p.shirtNumber, {
                      ...kitMarkerColors(p.player.primaryPosition, this.teamColor, this.teamSecondaryColor),
                      className: "kit-marker-bench",
                    })}
                  </button>`;
                })
                .join("")}
            </div>
            <p class="team-bench-hint">${
              this.context === "pause"
                ? "Drag starters to swap. Drag subs onto the pitch to substitute. Change formation above, then Apply."
                : "Drag one starter onto another to swap. Drag on the grass to nudge. Drag subs onto the pitch to replace."
            }</p>
          </aside>
        </div>
        ${this.modeNavHtml("TEAM")}
      </div>
      ${this.squadEditDialogHtml()}
    `;
    this.paintChalkCanvas();
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
    if (!this.editingPlayerId) return "";
    const sp = this.players.find((p) => p.player.id === this.editingPlayerId);
    if (!sp) return "";
    const p = sp.player;
    const a = sp.attrs;
    const posOpts = EDIT_POSITIONS.map(
      (pos) =>
        `<option value="${pos}"${pos === p.primaryPosition ? " selected" : ""}>${pos}</option>`,
    ).join("");
    const currentPortrait = p.appearance?.portraitAsset?.trim() || "";
    const portraitOpts = this.portraitOptionsHtml(currentPortrait);
    const groups = EDIT_STAT_GROUPS.map((group) => {
      const fields = group.fields
        .map((field) => {
          const raw = a[field.key];
          const stored = (p as PlayerAttributes)[field.key];
          const value =
            field.optional && (stored === undefined || stored === null)
              ? ""
              : String(typeof raw === "number" ? raw : stored ?? "");
          const ph = field.optional ? ` placeholder="auto"` : "";
          return `<label>${field.label} <input data-edit-stat="${field.key}" type="number" min="1" max="100" value="${escapeAttr(value)}"${ph} /></label>`;
        })
        .join("");
      return `<div class="squad-edit-group"><div class="squad-edit-group-title">${group.title}</div><div class="squad-edit-attrs">${fields}</div></div>`;
    }).join("");
    return `
      <div class="squad-edit-overlay" data-squad-edit="backdrop" role="presentation">
        <div class="squad-edit-dialog" role="dialog" aria-modal="true" aria-label="Edit player" data-squad-edit="dialog">
          <h3>Edit player</h3>
          <p class="hint">Portrait + full attributes. Blank optional stats use game defaults. Saves to local squad data.</p>
          <div class="squad-edit-portrait">
            <div class="squad-edit-portrait-preview" data-edit-preview>${portraitHtml(p, sp.shirtNumber, this.teamColor)}</div>
            <div class="squad-edit-portrait-controls">
              <label>PNG portrait
                <select data-edit-field="portraitAsset" title="Portrait from images/">${portraitOpts}</select>
              </label>
              <label class="portrait-upload-btn squad-edit-upload">Upload PNG
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-edit-upload hidden />
              </label>
            </div>
          </div>
          <label>Name <input data-edit-field="name" type="text" value="${escapeAttr(p.name)}" /></label>
          <label>Display name <input data-edit-field="displayName" type="text" value="${escapeAttr(p.displayName || p.name)}" /></label>
          <div class="squad-edit-row">
            <label>Shirt # <input data-edit-field="shirtNumber" type="number" min="1" max="99" value="${sp.shirtNumber}" /></label>
            <label>Position <select data-edit-field="primaryPosition">${posOpts}</select></label>
          </div>
          <div class="squad-edit-row">
            <label>Height (cm) <input data-edit-field="heightCm" type="number" min="150" max="220" value="${p.heightCm ?? ""}" placeholder="auto" /></label>
            <label>Weight (kg) <input data-edit-field="weightKg" type="number" min="50" max="120" value="${p.weightKg ?? ""}" placeholder="auto" /></label>
          </div>
          ${groups}
          <div class="row-btns">
            <button type="button" data-squad-edit="cancel">Cancel</button>
            <button type="button" class="primary" data-squad-edit="save">Save</button>
          </div>
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
    const row = (e.target as HTMLElement).closest<HTMLElement>(".roster-row[data-id]");
    if (!row || !this.root.contains(row)) return;
    e.preventDefault();
    const id = row.getAttribute("data-id");
    if (!id) return;
    this.selectPlayerId(id);
    void this.openSquadEdit(id);
  }

  private async openSquadEdit(id: string): Promise<void> {
    this.editingPlayerId = id;
    this.render();
    if (!this.imagesLoaded) {
      try {
        this.imagePaths = await listPlayerImages();
      } catch {
        this.imagePaths = [];
      }
      this.imagesLoaded = true;
      if (this.editingPlayerId === id) this.render();
    }
  }

  private onEditDialogClick(e: MouseEvent): void {
    const act = (e.target as HTMLElement).closest<HTMLElement>("[data-squad-edit]");
    if (!act) return;
    const kind = act.getAttribute("data-squad-edit");
    if (kind === "cancel" || kind === "backdrop") {
      e.preventDefault();
      this.editingPlayerId = null;
      this.render();
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
      const preview = this.root.querySelector("[data-edit-preview]");
      if (preview) preview.innerHTML = portraitHtml(sp.player, sp.shirtNumber, this.teamColor);
    }
  }

  private commitSquadPlayerEdit(): void {
    const id = this.editingPlayerId;
    if (!id) return;
    const sp = this.players.find((p) => p.player.id === id);
    if (!sp) {
      this.editingPlayerId = null;
      this.render();
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
    this.editingPlayerId = null;
    this.render();
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
      <div class="char-modes spot-player-modes">
        <button type="button" data-char="mode-player" class="on" aria-pressed="true">PLAYER SELECT</button>
      </div>
      <div class="char-nav char-nav-spot">
        <button type="button" data-char="prev">PREVIOUS</button>
        <button type="button" data-char="start" class="on primary spot-select-btn">SELECT ${escapeHtml(name).toUpperCase()}</button>
        <button type="button" data-char="next">NEXT</button>
      </div>
    `;
    }
    const kitMode = this.showKitUi()
      ? `<button type="button" data-char="mode-kit" class="${mode === "KIT" ? "on" : ""}">KIT SELECT</button>`
      : "";
    const startLabel = mode === "PLAYER" ? "START AS PLAYER" : "START AS TEAM";
    return `
      <div class="char-modes">
        <button type="button" data-char="mode-player" class="${mode === "PLAYER" ? "on" : ""}">PLAYER SELECT</button>
        <button type="button" data-char="mode-team" class="${mode === "TEAM" ? "on" : ""}">TEAM SELECT</button>
        ${kitMode}
      </div>
      <div class="char-nav">
        <button type="button" data-char="prev">PREVIOUS</button>
        <button type="button" data-char="start">${startLabel}</button>
        <button type="button" data-char="back">BACK</button>
        <button type="button" data-char="simulate">SIMULATE</button>
        <button type="button" data-char="next">NEXT</button>
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
      return [
        1,
        lineBandFromPosition(p.player.primaryPosition),
        sideRankFromPosition(p.player.primaryPosition),
        p.shirtNumber,
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

