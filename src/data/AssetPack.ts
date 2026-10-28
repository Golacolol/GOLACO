/**
 * Drop-in image pack for player portraits, team crests, and kit wraps.
 *
 * Place files under:
 *   public/assets/players/{playerId}.png|.webp|.jpg
 *   public/assets/crests/{teamId}.png|.webp|.jpg
 *   public/assets/kits/{teamId}_home.png|.webp
 *   public/assets/kits/{teamId}_away.png|.webp
 *
 * Optional manifest (overrides convention):
 *   public/data/assetPack.json
 *   {
 *     "players": { "player_id": "/assets/players/custom.png" },
 *     "crests":  { "team_id": "/assets/crests/custom.png" },
 *     "kits": { "team_id_home": "/assets/kits/custom_home.png" },
 *     "fallbackPortraits": ["/assets/players/_generic_01.png"]
 *   }
 *
 * Explicit appearance.portraitAsset / team.badgeAsset / kit.shirtAsset always win.
 * Resolved URLs go through `assetUrl` so builds work on file:// and GitHub Pages.
 */

import { assetUrl } from "../core/assetUrl";

export interface AssetPackManifest {
  players?: Record<string, string>;
  crests?: Record<string, string>;
  /** Keys like `{teamId}_home` / `{teamId}_away`. */
  kits?: Record<string, string>;
  /** Optional pool used when a player has no named portrait. */
  fallbackPortraits?: string[];
}

let manifest: AssetPackManifest | null = null;
let loadPromise: Promise<AssetPackManifest> | null = null;

const PLAYER_EXTS = [".png", ".webp", ".jpg", ".jpeg"] as const;
const CREST_EXTS = [".png", ".webp", ".jpg", ".jpeg", ".svg"] as const;
const KIT_EXTS = [".png", ".webp", ".jpg", ".jpeg"] as const;

export function playerPortraitCandidates(playerId: string): string[] {
  const id = playerId.trim();
  if (!id) return [];
  const fromManifest = manifest?.players?.[id];
  const out: string[] = [];
  if (fromManifest) out.push(fromManifest);
  for (const ext of PLAYER_EXTS) {
    out.push(`/assets/players/${id}${ext}`);
  }
  // Shirt-number style backups used by the Argyle fans XI pack historically.
  const num = id.match(/(\d+)$/)?.[1];
  if (num) {
    out.push(`/images/l${num}.png`);
    out.push(`/assets/players/l${num}.png`);
  }
  return out;
}

export function teamCrestCandidates(teamId: string): string[] {
  const id = teamId.trim();
  if (!id) return [];
  const fromManifest = manifest?.crests?.[id];
  const out: string[] = [];
  if (fromManifest) out.push(fromManifest);
  for (const ext of CREST_EXTS) {
    out.push(`/assets/crests/${id}${ext}`);
  }
  // Short aliases:
  //   plymouth_argyle_current → plymouth_argyle
  //   classic_arsenal_2003_04 → classic_arsenal
  //   classic_england_1996 → classic_england
  //   classic_boca_2000 → classic_boca
  const aliases = new Set<string>();
  const stripYear = (value: string) =>
    value.replace(/_current$/, "").replace(/_\d{4}_\d{2}$/, "").replace(/_\d{4}$/, "");
  let short = stripYear(id);
  if (short !== id) aliases.add(short);
  // classic_aston_villa_1995_96 → classic_aston_villa (already), also try once more if nested
  const shorter = stripYear(short);
  if (shorter !== short) aliases.add(shorter);
  for (const alias of aliases) {
    for (const ext of CREST_EXTS) out.push(`/assets/crests/${alias}${ext}`);
  }
  return out;
}

/** Stable fallback portrait from the pack pool (or null). */
export function fallbackPortraitFor(playerId: string): string | null {
  const pool = manifest?.fallbackPortraits;
  if (!pool?.length) return null;
  let h = 0;
  for (let i = 0; i < playerId.length; i++) h = (h + playerId.charCodeAt(i) * (i + 3)) % 997;
  const path = pool[h % pool.length];
  return path ? assetUrl(path) : null;
}

export function resolvePlayerPortraitUrl(
  playerId: string,
  explicit?: string | null,
): string | null {
  if (explicit && explicit.trim()) return assetUrl(explicit.trim());
  const candidates = playerPortraitCandidates(playerId);
  // Without probing the network at resolve-time, prefer the conventional PNG path
  // (img onerror / Three.js loader already fall back when missing).
  const path = candidates[0] ?? null;
  if (path) return assetUrl(path);
  return fallbackPortraitFor(playerId);
}

export function resolveTeamCrestUrl(teamId: string, explicit?: string | null): string | null {
  if (explicit && explicit.trim()) return assetUrl(explicit.trim());
  const path = teamCrestCandidates(teamId)[0];
  return path ? assetUrl(path) : null;
}

export function teamKitCandidates(teamId: string, variant: "home" | "away"): string[] {
  const id = teamId.trim();
  if (!id) return [];
  const key = `${id}_${variant}`;
  const fromManifest = manifest?.kits?.[key];
  const out: string[] = [];
  if (fromManifest) out.push(fromManifest);
  for (const ext of KIT_EXTS) {
    out.push(`/assets/kits/${id}_${variant}${ext}`);
  }
  // Short aliases (strip _current / season) — same idea as crests.
  const short = id.replace(/_current$/, "").replace(/_\d{4}_\d{2}$/, "").replace(/_\d{4}$/, "");
  if (short !== id) {
    for (const ext of KIT_EXTS) out.push(`/assets/kits/${short}_${variant}${ext}`);
  }
  return out;
}

export function resolveTeamKitUrl(
  teamId: string,
  variant: "home" | "away",
  explicit?: string | null,
): string | null {
  if (explicit && explicit.trim()) return assetUrl(explicit.trim());
  const path = teamKitCandidates(teamId, variant)[0];
  return path ? assetUrl(path) : null;
}

export async function loadAssetPackManifest(
  fetcher: typeof fetch = fetch,
): Promise<AssetPackManifest> {
  if (manifest) return manifest;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const res = await fetcher(assetUrl("/data/assetPack.json"));
      if (!res.ok) {
        manifest = {};
        return manifest;
      }
      const json = (await res.json()) as AssetPackManifest;
      manifest = {
        players: json.players ?? {},
        crests: json.crests ?? {},
        kits: json.kits ?? {},
        fallbackPortraits: json.fallbackPortraits ?? [],
      };
      return manifest;
    } catch {
      manifest = {};
      return manifest;
    }
  })();
  return loadPromise;
}

/** Test helper — inject a manifest without fetching. */
export function setAssetPackManifestForTests(next: AssetPackManifest | null): void {
  manifest = next;
  loadPromise = null;
}
