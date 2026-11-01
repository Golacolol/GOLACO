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
  /**
   * Disc fallback label under the shirt number.
   * Formation / roster use surname; match HUD uses initials (name lives beside the card).
   */
  badgeMode?: "surname" | "initials";
}

/**
 * Known portrait URL only (explicit appearance path).
 * Do not speculative-resolve convention `/assets/players/{id}.png` here — missing files
 * would flash number/name under the formation disc until img.onerror.
 */
export function portraitAsset(player: PortraitSource | undefined): string | null {
  const explicit = player?.appearance?.portraitAsset;
  if (explicit && typeof explicit === "string" && explicit.trim()) return assetUrl(explicit.trim());
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

/**
 * Particles that belong with the following surname token(s) on a kit
 * ("van der Sar", "Del Piero", "de Boer", "Di Livio", …).
 */
const SURNAME_PARTICLES = new Set([
  "van",
  "von",
  "der",
  "den",
  "de",
  "da",
  "das",
  "dos",
  "do",
  "del",
  "della",
  "delle",
  "dei",
  "degli",
  "di",
  "du",
  "des",
  "la",
  "le",
  "les",
  "lo",
  "los",
  "las",
  "ter",
  "ten",
  "te",
  "op",
  "aan",
  "af",
  "av",
  "zu",
  "zum",
  "zur",
  "vom",
  "y",
  "al",
  "el",
  "bin",
  "ibn",
  "bint",
  "ben",
  "st",
  "saint",
  "san",
]);

function isSurnameParticle(token: string): boolean {
  return SURNAME_PARTICLES.has(token.toLowerCase().replace(/['’]/g, ""));
}

/**
 * Kit / badge surname: keep multi-word surnames with particles
 * (Van Der Sar, Del Piero) instead of only the final token.
 */
export function kitSurnameFromName(name: string): string {
  const parts = name.replace(/\./g, " ").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "PLAYER";
  // Drop leading single-letter initials ("F. de Boer", "M. Cooper").
  let start = 0;
  while (start < parts.length - 1 && /^[A-Za-z]$/.test(parts[start]!)) start += 1;
  const tokens = parts.slice(start);
  if (tokens.length === 1) return tokens[0]!.toUpperCase();
  // Fan / club monikers ending in a short acronym ("Argyle USA", "City AFC").
  const last = tokens[tokens.length - 1]!;
  if (tokens.length >= 2 && /^[A-Z]{2,4}$/.test(last) && !isSurnameParticle(tokens[0]!)) {
    return tokens.join(" ").toUpperCase();
  }
  // From the end: include the final word plus any preceding particles.
  let i = tokens.length - 1;
  while (i > 0 && isSurnameParticle(tokens[i - 1]!)) i -= 1;
  return tokens.slice(i).join(" ").toUpperCase();
}

/** First given-name initial when a full name is available (e.g. Edwin → E). */
export function kitGivenInitial(displayName: string | undefined, fullName?: string | undefined): string | null {
  const surname = kitSurnameFromName(displayName || fullName || "");
  const source = (fullName || displayName || "").replace(/\./g, " ").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const surCount = surname.split(/\s+/).length;
  for (let i = 0; i <= parts.length - surCount; i++) {
    const slice = parts
      .slice(i, i + surCount)
      .join(" ")
      .toUpperCase();
    if (slice !== surname) continue;
    if (i === 0) return null;
    const given = parts[i - 1]!;
    if (isSurnameParticle(given) || given.length < 1) return null;
    if (/^[A-Za-z]/.test(given)) return given[0]!.toUpperCase();
    return null;
  }
  const first = parts[0]!;
  if (!isSurnameParticle(first) && first.toUpperCase() !== surname && /^[A-Za-z]/.test(first) && first.length > 1) {
    return first[0]!.toUpperCase();
  }
  return null;
}

/** Under-photo caption name: surname only (`VAN DER SAR`) — number sits beside it. */
export function kitCaptionSurname(displayName: string | undefined, fullName?: string | undefined): string {
  return kitSurnameFromName(displayName || fullName || "?");
}

/**
 * Short kit label for roster / detail headings: given initial + surname
 * (`R. HARDIE`, `E. VAN DER SAR`) — never the full first name.
 */
export function kitInitialSurnameLabel(displayName: string | undefined, fullName?: string | undefined): string {
  const surname = kitSurnameFromName(displayName || fullName || "?");
  const initial = kitGivenInitial(displayName, fullName);
  return initial ? `${initial}. ${surname}` : surname;
}

/** Scale surname text so long names still fit — mild shrink only; never go tiny when space exists. */
export function surnameFitPx(surname: string, base: number): number {
  const len = surname.length;
  if (len <= 5) return base;
  if (len <= 7) return Math.round(base * 0.9);
  if (len <= 9) return Math.round(base * 0.8);
  if (len <= 11) return Math.round(base * 0.72);
  if (len <= 13) return Math.round(base * 0.64);
  return Math.max(Math.round(base * 0.56), Math.min(base, 9));
}

/** Tighten tracking on long kit surnames so more letters fit before shrinking further. */
export function surnameLetterSpacingEm(surname: string): number {
  const len = surname.length;
  if (len <= 6) return 0.04;
  if (len <= 9) return 0.025;
  if (len <= 12) return 0.01;
  return 0;
}

/**
 * Shrink kit surnames in-place until they fit their marker — never ellipsize with "…".
 * Uses the full marker width for names under the disc; keeps a readable floor.
 */
export function fitKitSurnameElements(root: ParentNode): void {
  const nodes = root.querySelectorAll<HTMLElement>(
    ".portrait-badge-kit .sur, .kit-marker-caption .kit-marker-name, .pitch-name",
  );
  for (const el of nodes) {
    const caption = el.closest<HTMLElement>(".kit-marker-caption");
    const marker = el.closest<HTMLElement>(".kit-marker");
    const host =
      caption ??
      el.closest<HTMLElement>(".portrait-badge-kit, .pitch-kit") ??
      el.parentElement;
    // Name under photo: use full marker width (~72px+). Inside-badge: disc width.
    const markerW = marker?.clientWidth || host?.clientWidth || 52;
    // Caption is "num + name" on one row — fit against remaining width after the number.
    const numEl = caption?.querySelector<HTMLElement>(".kit-marker-num");
    const numW = numEl ? numEl.getBoundingClientRect().width + 4 : 0;
    const maxW = caption
      ? Math.max(36, Math.min(108, (caption.clientWidth || markerW || 112) - numW) - 4)
      : Math.max(28, (host?.clientWidth ?? el.clientWidth ?? 88) - 8);
    if (maxW < 8) continue;
    el.style.overflow = "hidden";
    el.style.textOverflow = "clip";
    el.style.whiteSpace = "nowrap";
    let size = parseFloat(el.style.fontSize) || parseFloat(getComputedStyle(el).fontSize) || 18;
    const trackingMatch = /^([\d.]+)em$/.exec(el.style.letterSpacing.trim());
    let tracking = trackingMatch ? Number(trackingMatch[1]) : 0.04;
    el.style.fontSize = `${size}px`;
    el.style.letterSpacing = `${tracking}em`;
    let guard = 0;
    // Caption under disc: shrink earlier so long names never crowd the counter.
    // Roster square surname is the hero line — keep it large.
    const rosterSur = !!el.closest(".kit-marker-roster");
    const floor = caption ? 10 : rosterSur ? 14 : 9;
    const over = () => el.scrollWidth > maxW + 0.5;
    while (over() && size > floor && guard < 48) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
      if (numEl) numEl.style.fontSize = `${size}px`;
      guard += 1;
    }
    while (over() && tracking > 0 && guard < 72) {
      tracking = Math.max(0, tracking - 0.01);
      el.style.letterSpacing = `${tracking}em`;
      guard += 1;
    }
    if (numEl && !numEl.style.fontSize) numEl.style.fontSize = `${size}px`;
  }
  fitRosterHeadingElements(root);
}

/**
 * Formation top-left `12. R. HARDIE` — use the card line width; shrink only when needed.
 */
export function fitRosterHeadingElements(root: ParentNode): void {
  const nodes = root.querySelectorAll<HTMLElement>(".team-roster-card h3");
  for (const el of nodes) {
    const card = el.closest<HTMLElement>(".team-roster-card");
    const maxW = Math.max(64, (card?.clientWidth ?? el.clientWidth ?? 168) - 8);
    if (maxW < 8) continue;
    el.style.overflow = "hidden";
    el.style.textOverflow = "clip";
    el.style.whiteSpace = "nowrap";
    el.style.fontSize = "";
    el.style.letterSpacing = "";
    // Prefer a large face that fills the line; only step down when it overflows.
    let size = 22;
    let tracking = 0.04;
    const floor = 13;
    el.style.fontSize = `${size}px`;
    el.style.letterSpacing = `${tracking}em`;
    let guard = 0;
    const over = () => el.scrollWidth > maxW + 0.5;
    while (over() && size > floor && guard < 48) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
      guard += 1;
    }
    while (over() && tracking > 0 && guard < 72) {
      tracking = Math.max(0, tracking - 0.01);
      el.style.letterSpacing = `${tracking}em`;
      guard += 1;
    }
  }
}

/**
 * Formation / substitute marker: circle badge with number above surname,
 * or PNG disc with number + surname under the image (only after the PNG loads).
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
  const initials = playerInitials(label);
  const badgeMode = options.badgeMode ?? "surname";
  // Caption under PNG: number + surname only (no given-name initial).
  const captionLabel = kitCaptionSurname(player.displayName, player.name);
  // Trusted = explicit appearance path. Speculative convention paths only promote on load.
  const trustedSrc = portraitAsset(player);
  const speculativeSrc =
    !trustedSrc && player.id ? resolvePlayerPortraitUrl(player.id, null) : null;
  const src = trustedSrc ?? speculativeSrc;
  const bench = (options.className ?? "").includes("kit-marker-bench");
  const roster = (options.className ?? "").includes("kit-marker-roster");
  // Roster square (no PNG): name is the hero line above the number.
  const surSize = surnameFitPx(surname, roster ? 26 : bench ? 15 : 17);
  const captionSize = surnameFitPx(captionLabel, bench ? 14 : 16);
  const tracking = surnameLetterSpacingEm(surname);
  const captionTracking = surnameLetterSpacingEm(captionLabel);
  const nameStyle = `font-size:${captionSize}px;letter-spacing:${captionTracking}em`;
  const surStyle = `font-size:${surSize}px;letter-spacing:${tracking}em`;
  // Under PNG: "12. SURNAME". Disc badge (no PNG): surname (formation) or initials (match HUD).
  const caption = `<div class="kit-marker-caption" style="color:${escapePortrait(text)}"><span class="kit-marker-num">${shirtNumber}.</span><span class="kit-marker-name" style="${nameStyle}">${escapePortrait(captionLabel)}</span></div>`;
  const badgeLabel =
    badgeMode === "initials"
      ? `<span class="ini">${escapePortrait(initials)}</span>`
      : `<span class="sur" style="${surStyle}">${escapePortrait(surname)}</span>`;
  const numSpan = `<span class="num">${shirtNumber}</span>`;
  // Top-left formation card only: surname above number. Pitch / bench / HUD keep number first.
  const badgeInner = roster ? `${badgeLabel}${numSpan}` : `${numSpan}${badgeLabel}`;
  const badge = `<div class="portrait-badge portrait-badge-kit" style="background:${escapePortrait(primary)};color:${escapePortrait(text)}">${badgeInner}</div>`;
  const badgeHidden = `<div class="portrait-badge portrait-badge-kit" hidden style="background:${escapePortrait(primary)};color:${escapePortrait(text)}">${badgeInner}</div>`;

  if (!src) {
    return `<div class="${wrapClass}"><div class="portrait">${badge}</div></div>`;
  }

  // Photo markers: PNG in a framed box + caption under only (never number/name on the image).
  const onLoad =
    "const m=this.closest('.kit-marker');if(!m)return;m.classList.add('kit-marker-photo');this.style.display='block';const b=this.nextElementSibling;if(b)b.hidden=true;";
  const onError =
    "const m=this.closest('.kit-marker');if(!m)return;m.classList.remove('kit-marker-photo');this.style.display='none';const b=this.nextElementSibling;if(b)b.hidden=false;const c=m.querySelector('.kit-marker-caption');if(c)c.remove();";

  if (trustedSrc) {
    return `<div class="${wrapClass} kit-marker-photo"><div class="portrait"><img alt="" src="${escapePortrait(trustedSrc)}" onerror="${onError}"/>${badgeHidden}</div>${caption}</div>`;
  }

  // Speculative path: start as in-disc badge; promote to photo+under-caption only onload.
  return `<div class="${wrapClass}"><div class="portrait"><img alt="" src="${escapePortrait(src)}" style="display:none" onload="${onLoad}" onerror="${onError}"/>${badge}</div>${caption}</div>`;
}

export function portraitHtml(
  player: PortraitSource,
  shirtNumber: number,
  color = "#007A3D",
  options?: {
    surnameOnly?: boolean;
    textColor?: string;
    className?: string;
    badgeMode?: "surname" | "initials";
  },
): string {
  if (options?.surnameOnly) {
    return kitMarkerHtml(player, shirtNumber, {
      primaryColor: color,
      textColor: options.textColor ?? "#ffffff",
      className: options.className,
      badgeMode: options.badgeMode,
    });
  }
  const src = portraitAsset(player);
  const label = player.displayName ?? player.name ?? "?";
  const fb = portraitFallback(label, shirtNumber, color);
  const surname = kitSurnameFromName(label);
  const surSize = surnameFitPx(surname, 11);
  const tracking = surnameLetterSpacingEm(surname);
  const text = options?.textColor?.trim() || "#ffffff";
  const badgeMode = options?.badgeMode ?? "surname";
  const badgeInner =
    badgeMode === "initials"
      ? `<span class="num">${fb.number}</span><span class="ini">${escapePortrait(fb.initials)}</span>`
      : `<span class="num">${fb.number}</span><span class="sur" style="font-size:${surSize}px;letter-spacing:${tracking}em">${escapePortrait(surname)}</span>`;
  const badge = `<div class="portrait-badge" style="background:${fb.color};color:${escapePortrait(text)}">${badgeInner}</div>`;
  if (!src) return `<div class="portrait">${badge}</div>`;
  return `<div class="portrait"><img alt="" src="${src}" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.hidden=false"/><div class="portrait-badge" hidden style="background:${fb.color};color:${escapePortrait(text)}">${badgeInner}</div></div>`;
}

function escapePortrait(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
