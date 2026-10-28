import type { SquadPlayer } from "../core/Database";
import { FORMATION_NAMES, getFormation, remapPlayersToFormation } from "../football/teams/Formation";
import type { KitChoice, TeamKit, TeamRecord } from "../data/schema";
import { kitsClash, pickTeamKit, teamHomeKit, teamResolvedAwayKit } from "../football/teams/KitClash";
import { fitKitSurnameElements, kitMarkerHtml, portraitHtml, teamBadgeHtml } from "./Portrait";
import { contrastingKitText } from "./kitContrast";

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

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Portrait formation layout: own goal at the bottom, attack toward the top. */
const LATERAL_CENTER = 48.5;
const LATERAL_HALF_SPAN = 44;

export function formationToPitchPercent(x: number, z: number): { left: number; bottom: number } {
  return {
    left: clamp(LATERAL_CENTER + (z / 0.5) * LATERAL_HALF_SPAN, 3, 96),
    bottom: clamp(toDisplayX(x) * 100, 1, 88),
  };
}

/** Minimum centre-to-centre gap so 60px markers do not overlap (percent of pitch). */
const MARKER_MIN_DX = 12.5;
const MARKER_MIN_DY = 13.5;
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

export interface TeamSelectSlot {
  slot: string;
  player: SquadPlayer;
}

interface SlotOffset {
  dx: number;
  dz: number;
}

interface NudgeState {
  pointerId: number;
  slotId: string;
  playerId: string;
  startClientX: number;
  startClientY: number;
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
  formation = "4-2-3-1";
  /** Shown in pause formation editor (substitutions remaining this match). */
  pauseSubsRemaining: number | null = null;
  /** Starting XI ids when the pause editor opened — used to count pending subs. */
  pauseOriginalStarterIds: Set<string> | null = null;
  /** Snapshot of lineup when pause editor opened — Apply highlights when this differs. */
  private pauseBaseline: string | null = null;
  private dirtyApply = false;
  xi: TeamSelectSlot[] = [];
  bench: SquadPlayer[] = [];
  /** Per-slot nudges from formation defaults. */
  slotOffsets = new Map<string, SlotOffset>();
  private dragPlayerId: string | null = null;
  private nudge: NudgeState | null = null;

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
    },
  ): void {
    this.teamName = teamName;
    this.teamColor = teamColor;
    this.teamSecondaryColor = options?.secondaryColor?.trim() || "#ffffff";
    this.teamRecord = options?.team && "defaultKit" in options.team ? options.team : null;
    this.opponentHomeKit = options?.opponentHomeKit ?? null;
    this.userIsAwaySide = !!options?.userIsAwaySide;
    this.kitChoice = options?.kitChoice ?? "auto";
    this.teamBadge = options?.team
      ? {
          id: options.team.id,
          name: options.team.name ?? teamName,
          abbreviation: options.team.abbreviation,
          badgeAsset: options.team.badgeAsset,
          primaryColor: options.team.primaryColor ?? teamColor,
          secondaryColor: options.team.secondaryColor ?? this.teamSecondaryColor,
        }
      : null;
    this.formation = options?.formation ?? "4-2-3-1";
    this.purpose = options?.purpose ?? "match";
    this.slotOffsets.clear();
    this.syncKitMarkerColors();
    const form = getFormation(this.formation);
    const slots = options?.starterSlots;
    this.xi = starters.slice(0, 11).map((player, i) => ({
      slot: slots?.[i] ?? form[i]?.id ?? `S${i}`,
      player,
    }));
    const mapped = remapPlayersToFormation(
      this.xi.map((row) => ({
        id: row.player.player.id,
        slot: row.slot,
        isGK: row.player.player.primaryPosition === "GK",
      })),
      this.formation,
      this.formation,
    );
    const byId = new Map(starters.map((s) => [s.player.id, s]));
    this.xi = mapped
      .map((row) => {
        const player = byId.get(row.id);
        return player ? { slot: row.slot, player } : null;
      })
      .filter((row): row is TeamSelectSlot => !!row);
    const onIds = new Set(this.xi.map((x) => x.player.player.id));
    const roster = options?.roster?.length ? options.roster : starters;
    this.bench = roster.filter((s) => !onIds.has(s.player.id));
    this.syncPlayersList();
    this.index = Math.max(
      0,
      this.players.findIndex((p) => p.player.primaryPosition !== "GK"),
    );
    if (this.index < 0) this.index = 0;
    // Spot practice stays on the formation panel so the taker can be picked from the pitch.
    this.controlMode = "TEAM";
    if (this.context === "pause") {
      this.pauseOriginalStarterIds = new Set(this.xi.map((row) => row.player.player.id));
      this.pauseBaseline = this.lineupFingerprint();
      this.dirtyApply = false;
    }
  }

  setPurpose(purpose: "match" | "spot"): void {
    this.purpose = purpose;
    if (purpose === "spot") this.controlMode = "TEAM";
  }

  private lineupFingerprint(): string {
    return JSON.stringify({
      formation: this.formation,
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

  private markDirtyIfNeeded(): void {
    if (this.context !== "pause" || !this.pauseBaseline) {
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
    if (!this.teamRecord) return null;
    const clash =
      !!this.opponentHomeKit && kitsClash(this.opponentHomeKit, this.teamRecord.defaultKit);
    const forceAway = this.userIsAwaySide && clash;
    return pickTeamKit(this.teamRecord, this.kitChoice, forceAway);
  }

  private syncKitMarkerColors(): void {
    const kit = this.selectedMatchKit();
    if (!kit) return;
    this.teamColor = kit.shirt;
    this.teamSecondaryColor = kit.trim || kit.numberColor || this.teamSecondaryColor;
  }

  private showKitUi(): boolean {
    return this.context === "select" && this.purpose === "match" && !!this.teamRecord;
  }

  /** HOME / AWAY / AUTO — shown on the kit panel team-name line. */
  private kitChoiceChipsHtml(): string {
    if (!this.showKitUi() || !this.teamRecord) return "";
    const home = teamHomeKit(this.teamRecord);
    const away = teamResolvedAwayKit(this.teamRecord);
    const clash =
      !!this.opponentHomeKit && kitsClash(this.opponentHomeKit, this.teamRecord.defaultKit);
    const forceAway = this.userIsAwaySide && clash;
    const autoKit = pickTeamKit(this.teamRecord, "auto", forceAway);
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

  getEditedLineup(): {
    formation: string;
    starters: { playerId: string; slot: string; offsetX?: number; offsetZ?: number }[];
  } {
    return {
      formation: this.formation,
      starters: this.xi.map((row) => {
        const off = this.slotOffsets.get(row.slot);
        return {
          playerId: row.player.player.id,
          slot: row.slot,
          ...(off && (off.dx || off.dz) ? { offsetX: off.dx, offsetZ: off.dz } : {}),
        };
      }),
    };
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

  render(): void {
    this.root.hidden = false;
    if (this.controlMode === "KIT") this.renderKit();
    else if (this.controlMode === "TEAM") this.renderTeam();
    else this.renderPlayer();
    requestAnimationFrame(() => fitKitSurnameElements(this.root));
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
        <div class="char-stats">
          ${stat("PACE", a.pace)}${stat("PASSING", a.passing)}${stat("CONTROL", a.control)}
          ${stat("SHOOTING", a.shooting)}${stat("DEFENDING", a.defending)}${stat("STAMINA", a.stamina)}
        </div>
        ${this.modeNavHtml("PLAYER")}
      </div>
    `;
  }

  private renderKit(): void {
    if (!this.teamRecord) {
      this.renderTeam();
      return;
    }
    const home = teamHomeKit(this.teamRecord);
    const away = teamResolvedAwayKit(this.teamRecord);
    const clash =
      !!this.opponentHomeKit && kitsClash(this.opponentHomeKit, this.teamRecord.defaultKit);
    const forceAway = this.userIsAwaySide && clash;
    const autoKit = pickTeamKit(this.teamRecord, "auto", forceAway);
    const hint = forceAway
      ? "Colour clash — AUTO wears your away strip for this fixture."
      : clash && !this.userIsAwaySide
        ? "Colour clash — the opposition will wear their away strip."
        : "Pick HOME or AWAY, or leave AUTO to switch only when colours clash.";
    const selected = this.selectedMatchKit() ?? autoKit;
    this.root.innerHTML = `
      <div class="char-panel char-panel-kit">
        <div class="kit-select-head">
          ${this.teamTitleHtml(this.teamName, { withKitChips: true })}
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
    const onPitch = new Set(this.xi.map((row) => row.player.player.id));
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
              <div class="char-num">#${selected.shirtNumber}</div>
              <h3>${escapeHtml(selected.player.name)}</h3>
              <div class="char-meta">${selected.player.primaryPosition} · OVR ${selected.overall}</div>
              <div class="char-stats char-stats-compact">
                ${stat("PACE", a.pace)}${stat("PASS", a.passing)}${stat("CTRL", a.control)}
                ${stat("SHOT", a.shooting)}${stat("DEF", a.defending)}${stat("STM", a.stamina)}
              </div>
            </div>
            <div class="team-roster-title">SQUAD</div>
            <div class="team-roster-list">
              ${this.players
                .map((p) => {
                  const name = kitSurname(p.player.displayName || p.player.name);
                  const active = p.player.id === selectedId ? "on" : "";
                  const role = onPitch.has(p.player.id) ? "XI" : "SUB";
                  return `<button type="button" class="roster-row ${active}" data-char="pick" data-id="${p.player.id}">
                    <span class="roster-num">${p.shirtNumber}</span>
                    <span class="roster-name">${escapeHtml(name)}</span>
                    <span class="roster-pos">${p.player.primaryPosition}</span>
                    <span class="roster-role">${role}</span>
                  </button>`;
                })
                .join("")}
            </div>
          </aside>
          <div class="team-pitch" aria-label="Formation pitch">
            <div class="team-pitch-markings" aria-hidden="true"></div>
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
                  return `<div class="pitch-slot ${selected}" data-slot="${slot.id}" data-player-id="${p.player.id}" style="left:${pos.left}%; bottom:${pos.bottom}%">
                  <button type="button" class="pitch-token ${selected}" data-char="pick" data-id="${p.player.id}" data-player-id="${p.player.id}" data-from-slot="${slot.id}" title="${escapeHtml(p.player.name)}">
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
                  return `<button type="button" class="bench-card ${active}" draggable="true" data-player-id="${p.player.id}" data-from-slot="" data-char="pick" data-id="${p.player.id}" title="${escapeHtml(p.player.name)}">
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
    `;
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
    this.nudge = {
      pointerId: e.pointerId,
      slotId,
      playerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
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
    const n = this.nudge;
    if (!n || e.pointerId !== n.pointerId) return;
    const dx = e.clientX - n.startClientX;
    const dy = e.clientY - n.startClientY;
    if (!n.moved && dx * dx + dy * dy < 25) return;
    n.moved = true;
    e.preventDefault();
    const rect = n.pitchEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const left = ((e.clientX - rect.left) / rect.width) * 100;
    const bottom = ((rect.bottom - e.clientY) / rect.height) * 100;
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
      } else {
        this.markDirtyIfNeeded();
      }
    }
    this.nudge = null;
    if (this.controlMode === "TEAM") this.render();
  }

  /** Prefer a nearby occupied slot for swap targeting (avoids pointer-capture hit-test issues). */
  private slotNearPoint(clientX: number, clientY: number, excludeSlotId: string): HTMLElement | null {
    let best: HTMLElement | null = null;
    let bestDist = 56 * 56;
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

function stat(label: string, value: number): string {
  return `<div><span>${label}</span><b>${value}</b><i style="width:${value}%"></i></div>`;
}
