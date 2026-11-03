import type { PositionCode, TeamRecord } from "../../data/schema";
import type { GameDatabase, SquadPlayer } from "../../core/Database";
import { isClassicMenuTeam } from "../../core/Database";
import { MITEAM_TEAM_ID } from "../../core/SaveManager";
import {
  clubBaseName,
  classicClubIdentity,
  eraFromTeam,
  formatEraRoll,
} from "../../ui/menuTeamSelect";

export type MiTeamPoolFilter =
  | { kind: "all" }
  | { kind: "league"; league: "PREMIER_LEAGUE" | "CHAMPIONSHIP" | "LEAGUE_ONE" | "LA_LIGA" | "SERIE_A" }
  | { kind: "classic" }
  | { kind: "club"; teamId: string };

export const MITEAM_FILTER_LEAGUES = [
  "PREMIER_LEAGUE",
  "CHAMPIONSHIP",
  "LEAGUE_ONE",
  "LA_LIGA",
  "SERIE_A",
] as const;

export const MITEAM_FILTER_LEAGUE_LABEL: Record<(typeof MITEAM_FILTER_LEAGUES)[number], string> = {
  PREMIER_LEAGUE: "Premier League",
  CHAMPIONSHIP: "Championship",
  LEAGUE_ONE: "League One",
  LA_LIGA: "La Liga",
  SERIE_A: "Serie A",
};

/** Line role for a formation slot — keeps XI packs inside GK / DEF / MID / FWD. */
export type MiTeamSlotRole = "GK" | "DEF" | "MID" | "FWD";

/** Substitute packs (BENCH_1…) once the XI is filled. */
export function isMiTeamBenchSlot(slot: string): boolean {
  return /^BENCH_\d+$/i.test(slot.trim());
}

/** Every position a substitute pack may pull (GK + outfield). */
export function allMiTeamPackPositions(): PositionCode[] {
  return ["GK", "RB", "RWB", "CB", "LB", "LWB", "DM", "CM", "AM", "RM", "LM", "RW", "LW", "ST"];
}

export function slotPackRole(slot: string): MiTeamSlotRole {
  const s = slot.toUpperCase();
  if (s === "GK") return "GK";
  if (["RB", "RWB", "LB", "LWB", "RCB", "LCB", "CB"].includes(s)) return "DEF";
  if (["RST", "LST", "ST", "RW", "LW"].includes(s)) return "FWD";
  // RCM/LCM/RM/LM/… stay in midfield. Bench is handled separately (all positions).
  return "MID";
}

/** All position codes allowed when broadening within a line (never cross DEF↔MID). */
export function positionsForRole(role: MiTeamSlotRole): PositionCode[] {
  if (role === "GK") return ["GK"];
  if (role === "DEF") return ["RB", "RWB", "CB", "LB", "LWB"];
  if (role === "FWD") return ["ST", "RW", "LW"];
  return ["DM", "CM", "AM", "RM", "LM"];
}

/**
 * Map formation slot ids to pack positions.
 * Midfield slots must not include full-backs; defence must not include midfielders.
 * Bench slots pull from every position.
 */
export function positionsForSlot(slot: string): PositionCode[] {
  const s = slot.toUpperCase();
  if (isMiTeamBenchSlot(s)) return allMiTeamPackPositions();
  if (s === "GK") return ["GK"];
  if (s === "RB" || s === "RWB") return ["RB", "RWB"];
  if (s === "LB" || s === "LWB") return ["LB", "LWB"];
  if (s === "RCB" || s === "LCB" || s === "CB") return ["CB"];
  if (s === "RDM" || s === "LDM" || s === "CDM" || s === "DM") return ["DM", "CM"];
  if (s === "RCM" || s === "LCM" || s === "CM") return ["CM", "DM", "AM"];
  if (s === "RAM" || s === "LAM" || s === "CAM" || s === "AM") return ["AM", "CM"];
  if (s === "RM") return ["RM", "RW"];
  if (s === "LM") return ["LM", "LW"];
  if (s === "RW") return ["RW", "RM", "ST"];
  if (s === "LW") return ["LW", "LM", "ST"];
  if (s === "RST" || s === "LST" || s === "ST") return ["ST"];
  // Unknown XI slot — midfielders only (never scatter defenders into mid packs).
  return ["CM", "DM", "AM", "RM", "LM"];
}

export function teamMatchesFilter(team: TeamRecord, filter: MiTeamPoolFilter): boolean {
  if (team.id === MITEAM_TEAM_ID) return false;
  if (filter.kind === "all") return true;
  if (filter.kind === "club") return team.id === filter.teamId;
  if (filter.kind === "classic") return isClassicMenuTeam(team);
  if (team.teamType !== "CURRENT_TEAM") return false;
  return team.league === filter.league;
}

export function poolCandidates(
  db: GameDatabase,
  options: {
    slot: string;
    filter: MiTeamPoolFilter;
    excludePlayerIds?: ReadonlySet<string>;
    /** When set, use this position list instead of positionsForSlot(slot). */
    positions?: readonly PositionCode[];
    /** Prefer primary-position matches (default true). */
    primaryOnly?: boolean;
  },
): SquadPlayer[] {
  const wanted = new Set(options.positions ?? positionsForSlot(options.slot));
  const primaryOnly = options.primaryOnly !== false;
  const exclude = options.excludePlayerIds ?? new Set<string>();
  const primaryHits: SquadPlayer[] = [];
  const secondaryHits: SquadPlayer[] = [];
  const seen = new Set<string>();
  for (const team of db.teams.values()) {
    if (!teamMatchesFilter(team, options.filter)) continue;
    for (const sp of db.getSquad(team.id)) {
      if (exclude.has(sp.player.id) || seen.has(sp.player.id)) continue;
      const pos = sp.player.primaryPosition;
      const secondary = sp.player.secondaryPositions ?? [];
      if (wanted.has(pos)) {
        seen.add(sp.player.id);
        primaryHits.push(sp);
        continue;
      }
      if (!primaryOnly && secondary.some((p) => wanted.has(p))) {
        seen.add(sp.player.id);
        secondaryHits.push(sp);
      }
    }
  }
  return primaryHits.length ? primaryHits : secondaryHits;
}

export function pickRandomForSlot(
  db: GameDatabase,
  options: { slot: string; filter: MiTeamPoolFilter; excludePlayerIds?: ReadonlySet<string> },
): SquadPlayer | null {
  // 1) Strict slot positions, primary only.
  let pool = poolCandidates(db, { ...options, primaryOnly: true });
  // 2) Same slot positions, allow secondary.
  if (!pool.length) pool = poolCandidates(db, { ...options, primaryOnly: false });
  // 3) Broaden: bench stays any-position; XI packs stay on the same line only.
  if (!pool.length) {
    const positions = isMiTeamBenchSlot(options.slot)
      ? allMiTeamPackPositions()
      : positionsForRole(slotPackRole(options.slot));
    pool = poolCandidates(db, { ...options, positions, primaryOnly: true });
  }
  if (!pool.length) {
    const positions = isMiTeamBenchSlot(options.slot)
      ? allMiTeamPackPositions()
      : positionsForRole(slotPackRole(options.slot));
    pool = poolCandidates(db, { ...options, positions, primaryOnly: false });
  }
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

/** Crest options for the MiTeam emblem picker (GOLACO + authored / pack crests). */
export function miteamCrestChoices(db: GameDatabase): { url: string; label: string }[] {
  const out: { url: string; label: string }[] = [];
  const seen = new Set<string>();
  const add = (url: string, label: string) => {
    const u = url.trim();
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push({ url: u, label: label.trim() || "Crest" });
  };
  add("/golaco-logo.png", "GOLACO");
  for (const team of db.teams.values()) {
    if (team.id === MITEAM_TEAM_ID) continue;
    const label = clubFilterLabel(team);
    const explicit = team.badgeAsset?.trim();
    if (explicit) {
      add(explicit, label);
      continue;
    }
    add(`/assets/crests/${team.id}.png`, label);
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

/** Dropdown label — Classic sides include era so repeats (e.g. Argyle eras) stay distinct. */
export function clubFilterLabel(team: TeamRecord): string {
  if (isClassicMenuTeam(team)) {
    const { label: base } = classicClubIdentity(team);
    const era = formatEraRoll(eraFromTeam(team));
    return era ? `${base} ${era}` : base;
  }
  return clubBaseName(team.name);
}

/** Clubs present in the current filterable pool (for dropdown). */
export function clubsInPool(db: GameDatabase): { teamId: string; label: string }[] {
  const out: { teamId: string; label: string }[] = [];
  for (const team of db.teams.values()) {
    if (team.id === MITEAM_TEAM_ID) continue;
    if (team.teamType === "CUSTOM_TEAM" && team.custom) continue;
    const squad = db.getSquad(team.id);
    if (!squad.length) continue;
    out.push({ teamId: team.id, label: clubFilterLabel(team) });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

export function serializeFilter(filter: MiTeamPoolFilter): string {
  if (filter.kind === "all") return "all";
  if (filter.kind === "classic") return "classic";
  if (filter.kind === "league") return `league:${filter.league}`;
  return `club:${filter.teamId}`;
}

export function parseFilter(raw: string): MiTeamPoolFilter {
  if (!raw || raw === "all") return { kind: "all" };
  if (raw === "classic") return { kind: "classic" };
  if (raw.startsWith("league:")) {
    const league = raw.slice(7);
    if ((MITEAM_FILTER_LEAGUES as readonly string[]).includes(league)) {
      return { kind: "league", league: league as (typeof MITEAM_FILTER_LEAGUES)[number] };
    }
  }
  if (raw.startsWith("club:")) {
    const teamId = raw.slice(5);
    if (teamId) return { kind: "club", teamId };
  }
  return { kind: "all" };
}
