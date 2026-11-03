/**
 * Shared player sports-card markup (Formation PLAYER SELECT + Player Database).
 */
import type { SquadPlayer } from "../core/Database";
import type { PlayerAttributes, PositionCode, TeamRecord } from "../data/schema";
import { listProfileAttrSpokes } from "../football/players/PlayerStats";
import { contrastingKitText } from "./kitContrast";
import { imageLabel } from "./playerImages";
import { kitSurnameFromName, portraitAsset, teamBadgeHtml } from "./Portrait";
import { titleAttr } from "./infoOverlays";
import { profileStatsBlock, type ProfileStatsMode } from "./ProfileHex";

export const EDIT_POSITIONS: PositionCode[] = [
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

export type EditStatKey = keyof PlayerAttributes;

export const EDIT_STAT_GROUPS: {
  title: string;
  fields: { key: EditStatKey; label: string; optional?: boolean }[];
}[] = [
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

/** Payload from card editor → persist to player + membership DBs. */
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
  stats: Partial<Record<EditStatKey, number | null>>;
};

export type PlayerCardTeamContext = {
  teamName: string;
  teamColor: string;
  teamSecondaryColor: string;
  team?: Pick<TeamRecord, "id" | "name" | "abbreviation" | "badgeAsset" | "primaryColor" | "secondaryColor"> | null;
};

export type PlayerCardRenderState = {
  editing: boolean;
  editDirty: boolean;
  flipped: boolean;
  /** Cumulative rotateY for side-aware flips (0 = front; odd×180 = back). */
  flipY?: number;
  profileView: ProfileStatsMode;
  /** Hex / radar size on the sports card front (default 172). */
  profileSize?: number;
  imagePaths: string[];
};

export type PlayerCardFlipSide = "left" | "right";

/** Which half of the card was tapped (screen space). */
export function playerCardFlipSideFromClientX(card: HTMLElement, clientX: number): PlayerCardFlipSide {
  const rect = card.getBoundingClientRect();
  return clientX < rect.left + rect.width / 2 ? "left" : "right";
}

/** Tap left → −180°; tap right → +180° (clicked edge leads the turn). */
export function nextPlayerCardFlipY(currentY: number, side: PlayerCardFlipSide): number {
  return currentY + (side === "left" ? -180 : 180);
}

export function isPlayerCardShowingBack(flipY: number): boolean {
  return Math.abs(Math.round(flipY / 180)) % 2 === 1;
}

/** Apply rotateY + face attrs without remounting (keeps the CSS transition). */
export function applyPlayerCardFlip(card: HTMLElement, flipY: number): void {
  const back = isPlayerCardShowingBack(flipY);
  card.style.setProperty("--card-flip-y", `${flipY}deg`);
  card.classList.toggle("is-flipped", back);
  card.setAttribute("data-face", back ? "back" : "front");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Player-card header label:
 * - "Inter Milan — 1993/94" → "Inter Milan 93/94"
 * - "Italy — 1982" / "Portugal — 2016" → "Italy 1982" / "Portugal 2016"
 * - "Plymouth Argyle — FANS" → "Plymouth Argyle Fans"
 */
export function formatPlayerCardTeamName(name: string): string {
  let s = name.trim();
  if (!s) return s;
  // "Club — FANS" / "Club - Fans" → "Club Fans"
  s = s.replace(/\s*[—–-]\s*(Fans)\b/gi, " $1");
  // "Club — 1993/94 …" / "Club - 2004/05 Istanbul" → "Club 93/94 …"
  s = s.replace(/\s*[—–-]\s*(?=(?:19|20)\d{2}\/\d{2}\b)/g, " ");
  s = s.replace(/\b(?:19|20)(\d{2})\/(\d{2})\b/g, "$1/$2");
  // Single calendar year: keep the full year, drop the dash — "Italy — 1982" → "Italy 1982"
  s = s.replace(/\s*[—–-]\s*((?:19|20)\d{2})\b/g, " $1");
  // Title-case the Fans tag after a strip so it doesn't stay ALL CAPS.
  s = s.replace(/\bFANS\b/g, "Fans");
  return s.replace(/\s{2,}/g, " ").trim();
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function kitSurname(name: string): string {
  return kitSurnameFromName(name);
}

function kitHeadingName(player: { displayName?: string; name?: string }): string {
  const raw = (player.displayName || player.name || "").trim();
  return kitSurname(raw) || raw || "PLAYER";
}

function portraitOptionsHtml(imagePaths: string[], current: string): string {
  const paths = [...imagePaths];
  if (current && !paths.includes(current)) paths.unshift(current);
  const opts = [`<option value="">(none)</option>`];
  for (const path of paths) {
    const selected = path === current ? " selected" : "";
    opts.push(`<option value="${escapeAttr(path)}"${selected}>${escapeHtml(imageLabel(path))}</option>`);
  }
  return opts.join("");
}

function actionBtnHtml(state: PlayerCardRenderState): string {
  if (state.editing && state.editDirty) {
    return `<button type="button" class="player-card-action primary" data-char="card-save"${titleAttr("Save player changes")}>SAVE</button>`;
  }
  if (state.editing) {
    return `<button type="button" class="player-card-action" data-char="card-view"${titleAttr("Back to player card")}>CARD</button>`;
  }
  return `<button type="button" class="player-card-action" data-char="card-edit"${titleAttr("Edit player details")}>EDIT</button>`;
}

function flipNavHtml(_sp: SquadPlayer): string {
  return `<div class="player-card-flip-nav" role="group" aria-label="Browse players">
    <button type="button" class="player-card-flip-btn" data-char="card-flip" data-dir="prev" aria-label="Previous player">‹</button>
    <span class="player-card-flip-spacer" aria-hidden="true"></span>
    <button type="button" class="player-card-flip-btn" data-char="card-flip" data-dir="next" aria-label="Next player">›</button>
  </div>`;
}

function crestHtml(team: PlayerCardTeamContext): string {
  const t = team.team;
  if (!t) {
    return `<div class="player-card-crest-fallback" style="background:${escapeAttr(team.teamColor)}"></div>`;
  }
  return teamBadgeHtml(
    {
      id: t.id,
      name: t.name ?? team.teamName,
      abbreviation: t.abbreviation,
      badgeAsset: t.badgeAsset,
      primaryColor: t.primaryColor ?? team.teamColor,
      secondaryColor: t.secondaryColor ?? team.teamSecondaryColor,
    },
    { className: "player-card-crest" },
  );
}

function photoHtml(sp: SquadPlayer, team: PlayerCardTeamContext): string {
  const src = portraitAsset(sp.player);
  const crestBlock = `<div class="player-card-photo has-crest"><div class="player-card-crest-host">${crestHtml(team)}</div></div>`;
  if (src) {
    return `<div class="player-card-photo has-photo" data-crest-fallback="${escapeAttr(encodeURIComponent(crestBlock))}">
      <img class="player-card-portrait" alt="" src="${escapeAttr(src)}" onerror="const box=this.closest('.player-card-photo');const fb=box?.dataset.crestFallback;if(!box||!fb){this.remove();return;}box.outerHTML=decodeURIComponent(fb);"/>
    </div>`;
  }
  return crestBlock;
}

function shirtHtml(sp: SquadPlayer, team: PlayerCardTeamContext, className = "player-card-shirt"): string {
  const text = contrastingKitText(team.teamColor, team.teamSecondaryColor);
  const surname = kitSurname(sp.player.displayName || sp.player.name);
  return `<div class="${className}" style="background:${escapeAttr(team.teamColor)};color:${escapeAttr(text)}">
    <span class="player-card-shirt-name">${escapeHtml(surname)}</span>
    <span class="player-card-shirt-num">${sp.shirtNumber}</span>
  </div>`;
}

function ratingsHtml(sp: SquadPlayer, editing: boolean): string {
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

function sportsCardHtml(sp: SquadPlayer, team: PlayerCardTeamContext, state: PlayerCardRenderState): string {
  const flipY = state.flipY ?? (state.flipped ? 180 : 0);
  const flipped = isPlayerCardShowingBack(flipY);
  const teamLabel = formatPlayerCardTeamName(team.teamName) || "TEAM";
  return `<div class="player-card player-card-select${flipped ? " is-flipped" : ""}" data-char="card-face" data-face="${flipped ? "back" : "front"}" style="--card-accent:${escapeAttr(team.teamColor)};--card-flip-y:${flipY}deg"${titleAttr("Flip card")} role="button" tabindex="0">
    <div class="player-card-inner">
      <div class="player-card-face player-card-front">
        <div class="player-card-top">
          <em class="player-card-meta-label">POS</em>
          <span class="player-card-team">${escapeHtml(teamLabel)}</span>
          <em class="player-card-meta-label player-card-meta-label-end">OVR</em>
          <span class="player-card-pos-code">${escapeHtml(sp.player.primaryPosition)}</span>
          <span class="player-card-ovr-holo">${Math.round(sp.overall)}</span>
        </div>
        ${photoHtml(sp, team)}
        ${profileStatsBlock(sp.attrs, { mode: state.profileView, size: state.profileSize ?? 148 })}
        ${shirtHtml(sp, team)}
      </div>
      <div class="player-card-face player-card-back">
        <div class="player-card-back-head">
          <em class="player-card-meta-label">POS</em>
          ${shirtHtml(sp, team, "player-card-shirt player-card-shirt-back")}
          <em class="player-card-meta-label player-card-meta-label-end">OVR</em>
          <span class="player-card-pos-code">${escapeHtml(sp.player.primaryPosition)}</span>
          <span class="player-card-ovr-value">${Math.round(sp.overall)}</span>
        </div>
        <div class="player-card-back-body">${ratingsHtml(sp, false)}</div>
      </div>
    </div>
  </div>`;
}

function editPanelHtml(sp: SquadPlayer, team: PlayerCardTeamContext, imagePaths: string[]): string {
  const details = `<section class="player-card-edit-section">
    <h4 class="player-card-edit-section-title">Details</h4>
    <div class="player-card-edit-identity">
      <div class="player-card-edit-portrait-row">
        <div class="player-card-edit-portrait-preview">${photoHtml(sp, team)}</div>
        <div class="player-card-edit-portrait-controls">
          <label>PNG portrait
            <select data-edit-field="portraitAsset"${titleAttr("Portrait from images/")}>${portraitOptionsHtml(imagePaths, sp.player.appearance?.portraitAsset?.trim() || "")}</select>
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
    ${ratingsHtml(sp, true)}
  </section>`;
  return `<div class="player-card-edit-panel" style="--card-accent:${escapeAttr(team.teamColor)}">${details}${stats}</div>`;
}

/** Full card chrome: head (EDIT/CARD/SAVE) + body + arrow nav. */
export function playerCardShellHtml(
  sp: SquadPlayer,
  team: PlayerCardTeamContext,
  state: PlayerCardRenderState,
): string {
  const editing = state.editing;
  return `<div class="player-card-shell player-card-shell-${editing ? "edit" : "select"}${editing ? " is-editing" : ""}">
    <div class="player-card-shell-head">
      ${actionBtnHtml(state)}
    </div>
    ${editing ? editPanelHtml(sp, team, state.imagePaths) : sportsCardHtml(sp, team, state)}
    ${flipNavHtml(sp)}
  </div>`;
}

/** Read edit-form fields from a card host into a SquadPlayerEdit payload. */
export function readSquadPlayerEditFromHost(
  host: ParentNode,
  sp: SquadPlayer,
  teamId: string,
): SquadPlayerEdit {
  const read = (field: string): string => {
    const el = host.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-edit-field="${field}"]`);
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
      const el = host.querySelector<HTMLInputElement>(`[data-edit-stat="${field.key}"]`);
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
  return {
    playerId: sp.player.id,
    teamId,
    name: read("name") || sp.player.name,
    displayName: read("displayName") || read("name") || sp.player.displayName,
    shirtNumber: Math.max(1, Math.min(99, Math.round(numOrNull(read("shirtNumber")) ?? sp.shirtNumber))),
    primaryPosition,
    portraitAsset: read("portraitAsset") || null,
    heightCm: heightRaw === null ? null : Math.max(150, Math.min(220, Math.round(heightRaw))),
    weightKg: weightRaw === null ? null : Math.max(50, Math.min(120, Math.round(weightRaw))),
    stats,
  };
}

export { escapeAttr, escapeHtml, kitHeadingName };
