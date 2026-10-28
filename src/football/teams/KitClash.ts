import type { KitChoice, TeamKit, TeamRecord } from "../../data/schema";
import { resolveTeamKitUrl } from "../../data/AssetPack";

function parseHex(color: string): { r: number; g: number; b: number } | null {
  const raw = color.trim().replace("#", "");
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return {
      r: parseInt(raw[0] + raw[0], 16),
      g: parseInt(raw[1] + raw[1], 16),
      b: parseInt(raw[2] + raw[2], 16),
    };
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
    };
  }
  return null;
}

/** Euclidean RGB distance in 0–441 range. */
export function kitColorDistance(a: string, b: string): number {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return 999;
  const dr = ca.r - cb.r;
  const dg = ca.g - cb.g;
  const db = ca.b - cb.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** Primary shirt colours are too similar for both sides to wear home kits. */
export function kitsClash(homeKit: TeamKit, awayHomeKit: TeamKit, threshold = 95): boolean {
  return kitColorDistance(homeKit.shirt, awayHomeKit.shirt) < threshold;
}

/** Attach conventional kit PNG path for wrap textures (loader falls back if missing). */
export function withKitShirtAsset(team: TeamRecord, kit: TeamKit, variant: "home" | "away"): TeamKit {
  if (kit.shirtAsset?.trim()) return kit;
  const url = resolveTeamKitUrl(team.id, variant, null);
  return url ? { ...kit, shirtAsset: url } : kit;
}

export function teamAwayKit(team: TeamRecord): TeamKit {
  return team.awayKit ?? deriveAwayKit(team);
}

export function teamHomeKit(team: TeamRecord): TeamKit {
  return withKitShirtAsset(team, team.defaultKit, "home");
}

export function teamResolvedAwayKit(team: TeamRecord): TeamKit {
  return withKitShirtAsset(team, teamAwayKit(team), "away");
}

/** Fallback when a team record has no authored away kit. */
export function deriveAwayKit(team: TeamRecord): TeamKit {
  const home = team.defaultKit;
  const secondary = team.secondaryColor || "#ffffff";
  const homeDist = kitColorDistance(home.shirt, secondary);
  if (homeDist >= 95) {
    return {
      shirt: secondary,
      shorts: home.shorts === secondary ? invertLightDark(secondary) : home.shorts,
      socks: secondary,
      trim: home.shirt,
      numberColor: contrastNumber(secondary),
    };
  }
  const alt = invertLightDark(home.shirt);
  return {
    shirt: alt,
    shorts: alt === "#111111" ? "#ffffff" : "#111111",
    socks: alt,
    trim: home.shirt,
    numberColor: contrastNumber(alt),
  };
}

function invertLightDark(hex: string): string {
  const c = parseHex(hex);
  if (!c) return "#ffffff";
  const lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  return lum > 0.55 ? "#111111" : "#ffffff";
}

function contrastNumber(hex: string): string {
  const c = parseHex(hex);
  if (!c) return "#ffffff";
  const lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  return lum > 0.55 ? "#111111" : "#ffffff";
}

export function pickTeamKit(team: TeamRecord, choice: KitChoice, forceAway: boolean): TeamKit {
  if (choice === "home") return teamHomeKit(team);
  if (choice === "away") return teamResolvedAwayKit(team);
  return forceAway ? teamResolvedAwayKit(team) : teamHomeKit(team);
}

export interface ResolveMatchKitsOptions {
  homeChoice?: KitChoice;
  awayChoice?: KitChoice;
}

/**
 * Home defaults to home kit. Away wears away kit when shirts clash (AUTO),
 * unless Kit Select forces HOME / AWAY on either side.
 */
export function resolveMatchKits(
  home: TeamRecord,
  away: TeamRecord,
  opts?: ResolveMatchKitsOptions,
): { home: TeamKit; away: TeamKit; clash: boolean } {
  const homeChoice = opts?.homeChoice ?? "auto";
  const awayChoice = opts?.awayChoice ?? "auto";
  const clash = kitsClash(home.defaultKit, away.defaultKit);
  return {
    home: pickTeamKit(home, homeChoice, false),
    away: pickTeamKit(away, awayChoice, clash),
    clash,
  };
}
