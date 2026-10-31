import {
  PROFILE_AXIS_IDS,
  PROFILE_AXIS_LABELS,
  deriveProfileAxes,
  type ProfileAxes,
  type ProfileAxisId,
} from "../football/players/PlayerStats";
import type { PlayerAttributes } from "../data/schema";

/** Build six-axis overalls from raw attrs. */
export function profileAxesFromAttrs(attrs: PlayerAttributes): ProfileAxes {
  return deriveProfileAxes(attrs);
}

function hexPoints(cx: number, cy: number, r: number): string {
  return PROFILE_AXIS_IDS.map((_, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 6;
    return `${cx + Math.cos(ang) * r},${cy + Math.sin(ang) * r}`;
  }).join(" ");
}

function valuePolygon(axes: ProfileAxes, cx: number, cy: number, maxR: number): string {
  return PROFILE_AXIS_IDS.map((id, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 6;
    const r = (Math.max(1, axes[id]) / 100) * maxR;
    return `${cx + Math.cos(ang) * r},${cy + Math.sin(ang) * r}`;
  }).join(" ");
}

/**
 * Single hex footprint: shape radar OR six rating values at the vertices — never both.
 * Same viewBox / size either way so the panel does not jump.
 */
export function profileHexSvg(
  axes: ProfileAxes,
  size = 132,
  mode: "hex" | "detail" = "hex",
): string {
  const cx = size / 2;
  const cy = size / 2;
  // Larger usable radius so the hex fills the frame (labels sit just inside).
  const maxR = size * 0.4;
  const rings = [0.33, 0.66, 1]
    .map(
      (t) =>
        `<polygon points="${hexPoints(cx, cy, maxR * t)}" fill="none" stroke="currentColor" stroke-opacity="0.18" stroke-width="1"/>`,
    )
    .join("");
  const spokes = PROFILE_AXIS_IDS.map((_, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 6;
    const x = cx + Math.cos(ang) * maxR;
    const y = cy + Math.sin(ang) * maxR;
    return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="currentColor" stroke-opacity="0.14" stroke-width="1"/>`;
  }).join("");

  let content: string;
  if (mode === "hex") {
    const labels = PROFILE_AXIS_IDS.map((id, i) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 6;
      const lx = cx + Math.cos(ang) * (maxR + size * 0.085);
      const ly = cy + Math.sin(ang) * (maxR + size * 0.085);
      const short = PROFILE_AXIS_LABELS[id].slice(0, 3).toUpperCase();
      return `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" class="profile-hex-label">${short}</text>`;
    }).join("");
    const shape = `<polygon points="${valuePolygon(axes, cx, cy, maxR)}" class="profile-hex-shape"/>`;
    content = `${shape}${labels}`;
  } else {
    // Six ratings sit on the same hex vertices — same outer shape as the radar.
    content = PROFILE_AXIS_IDS.map((id: ProfileAxisId, i) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 6;
      const lx = cx + Math.cos(ang) * (maxR * 0.72);
      const ly = cy + Math.sin(ang) * (maxR * 0.72);
      const short = PROFILE_AXIS_LABELS[id].slice(0, 3).toUpperCase();
      const v = axes[id];
      return `<g class="profile-hex-rating">
        <text x="${lx}" y="${ly - size * 0.055}" text-anchor="middle" dominant-baseline="middle" class="profile-hex-label">${short}</text>
        <text x="${lx}" y="${ly + size * 0.04}" text-anchor="middle" dominant-baseline="middle" class="profile-hex-value">${v}</text>
      </g>`;
    }).join("");
  }

  return `<svg class="profile-hex-svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${rings}${spokes}${content}</svg>`;
}

/** @deprecated Prefer hex detail vertices — kept for callers that need row HTML. */
export function profileDetailRows(axes: ProfileAxes): string {
  return PROFILE_AXIS_IDS.map((id: ProfileAxisId) => {
    const v = axes[id];
    return `<div><span>${PROFILE_AXIS_LABELS[id].toUpperCase()}</span><b>${v}</b><i style="width:${v}%"></i></div>`;
  }).join("");
}

/** Toggleable hex / detail block for Formation Panel & player sheet — one footprint. */
export function profileStatsBlock(
  attrs: PlayerAttributes,
  opts?: { compact?: boolean; mode?: "hex" | "detail"; size?: number },
): string {
  const axes = deriveProfileAxes(attrs);
  const mode = opts?.mode ?? "hex";
  const compact = opts?.compact ? " profile-stats-compact" : "";
  const size = opts?.size ?? (opts?.compact ? 148 : 168);
  const svg = profileHexSvg(axes, size, mode);
  return `<div class="profile-stats${compact}" data-char="profile-toggle" data-mode="${mode}" data-size="${size}" title="Toggle shape / ratings" role="button" tabindex="0">
    ${svg}
  </div>`;
}
