import {
  PROFILE_AXIS_IDS,
  PROFILE_AXIS_LABELS,
  PROFILE_AXIS_SHORT,
  deriveProfileAxes,
  listProfileAttrSpokes,
  type ProfileAxes,
  type ProfileAttrSpoke,
  type ProfileAxisId,
} from "../football/players/PlayerStats";
import type { PlayerAttributes } from "../data/schema";

export type ProfileStatsMode = "hex" | "detail" | "full";

/** Hex → N-gon (all attrs) → six rating bars → hex. */
const PROFILE_MODE_ORDER: ProfileStatsMode[] = ["hex", "full", "detail"];

/** Cycle hex (6) → full N-gon → bars (6) → hex. */
export function nextProfileStatsMode(mode: ProfileStatsMode): ProfileStatsMode {
  const i = PROFILE_MODE_ORDER.indexOf(mode);
  return PROFILE_MODE_ORDER[(i + 1) % PROFILE_MODE_ORDER.length]!;
}

export function profileModeTitle(mode: ProfileStatsMode): string {
  if (mode === "hex") return "Shape overview — click for full attributes";
  if (mode === "full") return "All attributes — click for ratings";
  return "Six ratings — click for hex overview";
}

/** Build six-axis overalls from raw attrs. */
export function profileAxesFromAttrs(attrs: PlayerAttributes): ProfileAxes {
  return deriveProfileAxes(attrs);
}

function ringPoints(cx: number, cy: number, r: number, n: number): string {
  return Array.from({ length: n }, (_, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return `${cx + Math.cos(ang) * r},${cy + Math.sin(ang) * r}`;
  }).join(" ");
}

function valuePolygonFromValues(values: number[], cx: number, cy: number, maxR: number): string {
  const n = values.length || 1;
  return values
    .map((v, i) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const r = (Math.max(1, v) / 100) * maxR;
      return `${cx + Math.cos(ang) * r},${cy + Math.sin(ang) * r}`;
    })
    .join(" ");
}

function radarSvg(opts: {
  values: number[];
  labels: string[];
  size: number;
  className: string;
  showLabels: boolean;
  labelClass: string;
}): string {
  const { values, labels, size, className, showLabels, labelClass } = opts;
  const n = Math.max(3, values.length);
  const cx = size / 2;
  const cy = size / 2;
  // Slightly tighter than hex so dense labels stay inside the fixed footprint.
  const maxR = size * (showLabels && n > 10 ? 0.36 : 0.4);
  const rings = [0.33, 0.66, 1]
    .map(
      (t) =>
        `<polygon points="${ringPoints(cx, cy, maxR * t, n)}" fill="none" stroke="currentColor" stroke-opacity="0.18" stroke-width="1"/>`,
    )
    .join("");
  const spokes = Array.from({ length: n }, (_, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const x = cx + Math.cos(ang) * maxR;
    const y = cy + Math.sin(ang) * maxR;
    return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="currentColor" stroke-opacity="0.14" stroke-width="1"/>`;
  }).join("");
  const labelFont = n > 18 ? 5.5 : n > 12 ? 6.5 : 8;
  const labelHtml = showLabels
    ? labels
        .map((text, i) => {
          const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
          const lr = maxR + size * (n > 12 ? 0.055 : 0.048);
          const lx = cx + Math.cos(ang) * lr;
          const ly = cy + Math.sin(ang) * lr;
          return `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" class="${labelClass}" font-size="${labelFont}">${text}</text>`;
        })
        .join("")
    : "";
  const shape = `<polygon points="${valuePolygonFromValues(values, cx, cy, maxR)}" class="profile-hex-shape"/>`;
  return `<svg class="profile-hex-svg ${className}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${rings}${spokes}${shape}${labelHtml}</svg>`;
}

/**
 * Hex radar shape for the formation / player card.
 * Detail mode uses bar rows instead — keep the same outer footprint via profileStatsBlock.
 */
export function profileHexSvg(axes: ProfileAxes, size = 132): string {
  return radarSvg({
    values: PROFILE_AXIS_IDS.map((id) => axes[id]),
    labels: PROFILE_AXIS_IDS.map((id) => PROFILE_AXIS_SHORT[id]),
    size,
    className: "profile-hex-six",
    showLabels: true,
    labelClass: "profile-hex-label",
  });
}

/** N-gon of every registered attribute — same box size as the six-axis hex. */
export function profileFullSvg(spokes: ProfileAttrSpoke[], size = 132): string {
  const list = spokes.length >= 3 ? spokes : [{ key: "pace" as const, short: "—", label: "—", value: 1 }];
  // Dense full radar: keep short tags when they still fit; otherwise shape-only.
  const showLabels = list.length <= 22;
  return radarSvg({
    values: list.map((s) => s.value),
    labels: list.map((s) => s.short),
    size,
    className: "profile-hex-full",
    showLabels,
    labelClass: "profile-hex-label profile-hex-label-full",
  });
}

/** Six axis bars — classic player-details layout. */
export function profileDetailRows(axes: ProfileAxes): string {
  return PROFILE_AXIS_IDS.map((id: ProfileAxisId) => {
    const v = axes[id];
    return `<div><span>${PROFILE_AXIS_LABELS[id].toUpperCase()}</span><b>${v}</b><i style="width:${v}%"></i></div>`;
  }).join("");
}

/**
 * Toggleable hex ↔ full N-gon ↔ bars — one fixed footprint so the panel does not jump.
 */
export function profileStatsBlock(
  attrs: PlayerAttributes,
  opts?: { compact?: boolean; mode?: ProfileStatsMode; size?: number },
): string {
  const axes = deriveProfileAxes(attrs);
  const mode: ProfileStatsMode = opts?.mode ?? "hex";
  const compact = opts?.compact ? " profile-stats-compact" : "";
  const size = opts?.size ?? (opts?.compact ? 168 : 188);
  let body: string;
  if (mode === "hex") {
    body = profileHexSvg(axes, size);
  } else if (mode === "full") {
    body = profileFullSvg(listProfileAttrSpokes(attrs), size);
  } else {
    body = `<div class="char-stats ${opts?.compact ? "char-stats-compact " : ""}profile-detail-bars">${profileDetailRows(axes)}</div>`;
  }
  return `<div class="profile-stats${compact}" data-char="profile-toggle" data-mode="${mode}" data-size="${size}" title="${profileModeTitle(mode)}" role="button" tabindex="0" style="width:${size}px;height:${size}px">
    ${body}
  </div>`;
}
