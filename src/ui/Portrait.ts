import { assetUrl } from "../core/assetUrl";
import { resolvePlayerPortraitUrl, resolveTeamCrestUrl } from "../data/AssetPack";

export interface PortraitSource {
  id?: string;
  name?: string;
  displayName?: string;
  appearance?: { portraitAsset?: string | null; fullBodyAsset?: string | null };
}

export interface PortraitFallback {
  kind: "badge";
  number: number;
  initials: string;
  color: string;
}

export interface KitMarkerOptions {
  /** Primary kit / badge fill. */
  primaryColor?: string;
  /** Number + surname text colour (secondary kit colour). */
  textColor?: string;
  /** Extra class on the outer wrapper (e.g. bench sizing). */
  className?: string;
}

export function portraitAsset(player: PortraitSource | undefined): string | null {
  const explicit = player?.appearance?.portraitAsset;
  if (explicit && typeof explicit === "string" && explicit.trim()) return assetUrl(explicit.trim());
  // Convention / manifest: /assets/players/{id}.png — img onerror covers missing files.
  if (player?.id) return resolvePlayerPortraitUrl(player.id, null);
  return null;
}

/** Team crest / emblem URL from TeamRecord.badgeAsset (asset pack or explicit). */
export function teamBadgeAsset(team: { id?: string; badgeAsset?: string | null } | undefined): string | null {
  const explicit = team?.badgeAsset;
  if (explicit && typeof explicit === "string" && explicit.trim()) return assetUrl(explicit.trim());
  if (team?.id) return resolveTeamCrestUrl(team.id, null);
  return null;
}

/**
 * HTML for a club crest. Falls back to abbreviation initials in club colours.
 */
export function teamBadgeHtml(
  team: { id?: string; name?: string; abbreviation?: string; badgeAsset?: string | null; primaryColor?: string; secondaryColor?: string },
  options?: { className?: string; size?: number },
): string {
  const cls = ["team-badge", options?.className].filter(Boolean).join(" ");
  const primary = team.primaryColor || "#333333";
  const secondary = team.secondaryColor || "#ffffff";
  const label = (team.abbreviation || team.name || "?").slice(0, 3).toUpperCase();
  const src = teamBadgeAsset(team);
  const size = options?.size ? `width:${options.size}px;height:${options.size}px;` : "";
  const fallback = `<span class="team-badge-fallback" style="background:${escapePortrait(primary)};color:${escapePortrait(secondary)}">${escapePortrait(label)}</span>`;
  if (!src) return `<div class="${cls}" style="${size}">${fallback}</div>`;
  return `<div class="${cls}" style="${size}"><img alt="" src="${escapePortrait(src)}" onerror="this.style.display='none';const fb=this.nextElementSibling;if(fb){fb.hidden=false;fb.classList.remove('is-hidden')}"/><span class="team-badge-fallback is-hidden" hidden style="background:${escapePortrait(primary)};color:${escapePortrait(secondary)}">${escapePortrait(label)}</span></div>`;
}

export function playerInitials(name: string): string {
  const parts = name.replace(/\./g, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function portraitFallback(name: string, shirtNumber: number, color = "#007A3D"): PortraitFallback {
  return { kind: "badge", number: shirtNumber, initials: playerInitials(name), color };
}

export function kitSurnameFromName(name: string): string {
  const parts = name.replace(/\./g, " ").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "PLAYER";
  return parts[parts.length - 1].toUpperCase();
}

/** Scale surname text so long names still fit in the kit circle / caption. */
export function surnameFitPx(surname: string, base: number): number {
  const len = surname.length;
  if (len <= 4) return base;
  if (len <= 6) return Math.round(base * 0.9);
  if (len <= 8) return Math.round(base * 0.76);
  if (len <= 10) return Math.round(base * 0.64);
  if (len <= 12) return Math.round(base * 0.54);
  if (len <= 14) return Math.round(base * 0.46);
  return Math.max(7, Math.round(base * 0.4));
}

/** Tighten tracking on long kit surnames so more letters fit before shrinking further. */
export function surnameLetterSpacingEm(surname: string): number {
  const len = surname.length;
  if (len <= 6) return 0.05;
  if (len <= 9) return 0.03;
  if (len <= 12) return 0.015;
  return 0;
}

/**
 * Shrink kit surnames in-place until they fit their marker — never ellipsize with "…".
 */
export function fitKitSurnameElements(root: ParentNode): void {
  const nodes = root.querySelectorAll<HTMLElement>(
    ".portrait-badge-kit .sur, .kit-marker-caption .kit-marker-name, .pitch-name",
  );
  for (const el of nodes) {
    const caption = el.closest<HTMLElement>(".kit-marker-caption");
    const host =
      caption ??
      el.closest<HTMLElement>(".portrait-badge-kit, .pitch-kit") ??
      el.parentElement;
    // Photo captions: number + name share one line under the formation disc (~56px).
    const maxW = caption
      ? Math.max(12, Math.min(56, caption.clientWidth || 56) - 2)
      : Math.max(10, (host?.clientWidth ?? el.clientWidth ?? 36) - 2);
    if (maxW < 8) continue;
    el.style.overflow = caption ? "hidden" : "visible";
    el.style.textOverflow = "clip";
    el.style.whiteSpace = "nowrap";
    let size = parseFloat(el.style.fontSize) || parseFloat(getComputedStyle(el).fontSize) || 14;
    const trackingMatch = /^([\d.]+)em$/.exec(el.style.letterSpacing.trim());
    let tracking = trackingMatch ? Number(trackingMatch[1]) : 0.04;
    el.style.fontSize = `${size}px`;
    el.style.letterSpacing = `${tracking}em`;
    let guard = 0;
    const over = () => (caption ? caption.scrollWidth > maxW + 1 : el.scrollWidth > maxW);
    while (over() && size > 6.5 && guard < 40) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
      guard += 1;
    }
    while (over() && tracking > 0 && guard < 60) {
      tracking = Math.max(0, tracking - 0.01);
      el.style.letterSpacing = `${tracking}em`;
      guard += 1;
    }
  }
}

/**
 * Formation / substitute marker: circle badge with number above surname,
 * or PNG circle with number + surname under the image.
 */
export function kitMarkerHtml(
  player: PortraitSource,
  shirtNumber: number,
  options: KitMarkerOptions = {},
): string {
  const primary = options.primaryColor ?? "#007A3D";
  const text = options.textColor ?? "#ffffff";
  const wrapClass = ["kit-marker", options.className].filter(Boolean).join(" ");
  const label = player.displayName ?? player.name ?? "?";
  const surname = kitSurnameFromName(label);
  const src = portraitAsset(player);
  const bench = (options.className ?? "").includes("kit-marker-bench");
  // Bench circles are larger; keep type modest so number+surname fit inside the disc.
  const surSize = surnameFitPx(surname, bench ? 12 : 12);
  const captionSize = surnameFitPx(surname, bench ? 12 : 13);
  const tracking = surnameLetterSpacingEm(surname);
  const nameStyle = `font-size:${captionSize}px;letter-spacing:${tracking}em`;
  const surStyle = `font-size:${surSize}px;letter-spacing:${tracking}em`;
  const caption = `<div class="kit-marker-caption" style="color:${escapePortrait(text)}"><span class="kit-marker-num">${shirtNumber}</span><span class="kit-marker-name" style="${nameStyle}">${escapePortrait(surname)}</span></div>`;
  const badge = `<div class="portrait-badge portrait-badge-kit" style="background:${escapePortrait(primary)};color:${escapePortrait(text)}"><span class="num">${shirtNumber}</span><span class="sur" style="${surStyle}">${escapePortrait(surname)}</span></div>`;

  if (!src) {
    return `<div class="${wrapClass}"><div class="portrait">${badge}</div></div>`;
  }

  return `<div class="${wrapClass} kit-marker-photo"><div class="portrait"><img alt="" src="${src}" onerror="this.closest('.kit-marker')?.classList.remove('kit-marker-photo'); this.style.display='none'; const b=this.nextElementSibling; if(b){b.hidden=false; const c=this.closest('.kit-marker')?.querySelector('.kit-marker-caption'); if(c) c.remove();}"/><div class="portrait-badge portrait-badge-kit" hidden style="background:${escapePortrait(primary)};color:${escapePortrait(text)}"><span class="num">${shirtNumber}</span><span class="sur" style="${surStyle}">${escapePortrait(surname)}</span></div></div>${caption}</div>`;
}

export function portraitHtml(
  player: PortraitSource,
  shirtNumber: number,
  color = "#007A3D",
  options?: { surnameOnly?: boolean; textColor?: string },
): string {
  if (options?.surnameOnly) {
    return kitMarkerHtml(player, shirtNumber, {
      primaryColor: color,
      textColor: options.textColor ?? "#ffffff",
    });
  }
  const src = portraitAsset(player);
  const label = player.displayName ?? player.name ?? "?";
  const fb = portraitFallback(label, shirtNumber, color);
  const text = options?.textColor?.trim() || "#ffffff";
  const badge = `<div class="portrait-badge" style="background:${fb.color};color:${escapePortrait(text)}"><span class="num">${fb.number}</span><span class="ini">${fb.initials}</span></div>`;
  if (!src) return `<div class="portrait">${badge}</div>`;
  return `<div class="portrait"><img alt="" src="${src}" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.hidden=false"/><div class="portrait-badge" hidden style="background:${fb.color};color:${escapePortrait(text)}"><span class="num">${fb.number}</span><span class="ini">${fb.initials}</span></div></div>`;
}

function escapePortrait(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
