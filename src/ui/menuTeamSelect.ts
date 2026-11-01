import type { TeamRecord } from "../data/schema";

export type MenuTeamGroup =
  | "PREMIER_LEAGUE"
  | "CHAMPIONSHIP"
  | "LEAGUE_ONE"
  | "LA_LIGA"
  | "SERIE_A"
  | "CLASSIC";

export interface MenuTeamOption {
  id: string;
  /** Short club label (no era) for the Team dial. */
  label: string;
  group: MenuTeamGroup;
  /**
   * Club identity for Classic era grouping (base name).
   * Same for every season of e.g. AC Milan.
   */
  clubKey: string;
  /** Short roll label e.g. "91-92"; empty for current league clubs. */
  eraLabel: string;
  /** Sort key for eras (season string). */
  eraSort: string;
}

const GROUP_ORDER: MenuTeamGroup[] = [
  "PREMIER_LEAGUE",
  "CHAMPIONSHIP",
  "LEAGUE_ONE",
  "LA_LIGA",
  "SERIE_A",
  "CLASSIC",
];

export const MENU_TEAM_GROUPS: MenuTeamGroup[] = [...GROUP_ORDER];

export const MENU_TEAM_GROUP_LABEL: Record<MenuTeamGroup, string> = {
  PREMIER_LEAGUE: "Premier League",
  CHAMPIONSHIP: "Championship",
  LEAGUE_ONE: "League One",
  LA_LIGA: "La Liga",
  SERIE_A: "Serie A",
  CLASSIC: "Classic",
};

/**
 * Strip era suffixes: "Arsenal — 2003/04" → "Arsenal".
 * Accepts em/en dashes and space-hyphen-space (not hyphenated club names like Saint-Germain).
 */
export function clubBaseName(name: string): string {
  return name.split(/\s*[—–]\s*|\s+-\s+/)[0]!.trim();
}

/** Authored Argyle classic / fans sides — always one Classics Club dial entry. */
const PLYMOUTH_ARGYLE_CLUB_IDS = new Set([
  "argyle_historic_sample",
  "argyle_fans_xi",
  "classic_plymouth_argyle_1995_96",
  "classic_plymouth_argyle_2003_04",
  "classic_plymouth_argyle_2016_17",
]);

/**
 * Classics Club dial identity. Argyle historic / fans ids (and "Argyle…" name aliases)
 * share Plymouth Argyle even if a stale save renamed the display string.
 */
export function classicClubIdentity(team: TeamRecord): { key: string; label: string } {
  const id = team.id.toLowerCase();
  if (
    PLYMOUTH_ARGYLE_CLUB_IDS.has(team.id) ||
    id.includes("plymouth_argyle") ||
    id.startsWith("argyle_")
  ) {
    return { key: "plymouth argyle", label: "Plymouth Argyle" };
  }
  const base = clubBaseName(team.name);
  const key = base.toLowerCase();
  if (key === "argyle" || key === "pafc" || key.startsWith("argyle ")) {
    return { key: "plymouth argyle", label: "Plymouth Argyle" };
  }
  return { key, label: base };
}

/**
 * Compact era for the roll dial: "2003/04" → "03-04", "1991/92" → "91-92",
 * "2000" → "00", "1990s" → "90s". Never returns nicknames (e.g. Mourinho).
 */
export function formatEraRoll(season: string | null | undefined): string {
  const raw = (season ?? "").trim();
  if (!raw) return "";
  // 2003/04 or 2003-04 (optionally with trailing nickname text)
  const pair = /(\d{4})\s*[\/\-–]\s*(\d{2}|\d{4})\b/.exec(raw);
  if (pair) {
    const a = pair[1]!.slice(2);
    const b = pair[2]!.length === 4 ? pair[2]!.slice(2) : pair[2]!;
    return `${a}-${b}`;
  }
  // Single year 2000 / 1986 (standalone or after em-dash)
  const year = /(?:^|[—–\s])(\d{4})(?:\s|$)/.exec(raw);
  if (year) return year[1]!.slice(2);
  // Decade label 1990s
  const decade = /^(\d{4})s$/i.exec(raw);
  if (decade) return `${decade[1]!.slice(2)}s`;
  // Already a short date token like "04-05" / "91/92"
  if (/^\d{2}[\/\-–]\d{2}$/.test(raw)) return raw.replace(/[\/–]/g, "-");
  // Short era codes (FANS, LEG) — not calendar seasons
  if (/^[A-Za-z0-9]{2,6}$/.test(raw) && !/^\d{4}$/.test(raw)) return raw.toUpperCase();
  return "";
}

/** Prefer historicSeason; else parse from "Club — 2003/04 …" or "Club — FANS". */
export function eraFromTeam(team: TeamRecord): string {
  if (team.historicSeason?.trim()) return team.historicSeason.trim();
  const parts = team.name.split(/\s*[—–]\s*|\s+-\s+/);
  if (parts.length < 2) return "";
  const tail = parts.slice(1).join(" — ").trim();
  const m = /^(\d{4}(?:\s*[\/\-–]\s*\d{2,4})?|\d{4}s?)/.exec(tail);
  if (m) return m[1]!.replace(/\s+/g, "");
  if (/^[A-Za-z0-9]{2,6}$/.test(tail)) return tail;
  return "";
}

function isClassicTeam(team: TeamRecord): boolean {
  return (
    team.id.startsWith("classic_") ||
    team.teamType === "HISTORIC_TEAM" ||
    team.teamType === "HISTORIC_OPPONENT" ||
    team.teamType === "INTERNATIONAL" ||
    team.teamType === "LEGENDS_TEAM" ||
    team.teamType === "FANS_TEAM" ||
    !!team.fanTeam
  );
}

function isSelectableClub(team: TeamRecord): boolean {
  if (team.teamType === "CURRENT_TEAM") return true;
  if (isClassicTeam(team)) return true;
  return false;
}

function groupFor(team: TeamRecord): MenuTeamGroup {
  if (
    team.teamType === "CURRENT_TEAM" &&
    (team.league === "PREMIER_LEAGUE" ||
      team.league === "CHAMPIONSHIP" ||
      team.league === "LEAGUE_ONE" ||
      team.league === "LA_LIGA" ||
      team.league === "SERIE_A")
  ) {
    return team.league;
  }
  return "CLASSIC";
}

/**
 * Flat team list for the main-menu dials.
 * Classic sides use the club base name on the Team dial; era lives on the Era roll.
 */
export function buildMenuTeamOptions(teams: TeamRecord[]): MenuTeamOption[] {
  const options: MenuTeamOption[] = [];
  for (const team of teams) {
    if (!isSelectableClub(team)) continue;
    const group = groupFor(team);
    const classic = group === "CLASSIC" ? classicClubIdentity(team) : null;
    const base = classic?.label ?? clubBaseName(team.name);
    const eraRaw = group === "CLASSIC" ? eraFromTeam(team) : "";
    options.push({
      id: team.id,
      label: base,
      group,
      clubKey: classic ? classic.key : team.id,
      eraLabel: group === "CLASSIC" ? formatEraRoll(eraRaw) || formatEraRoll(team.name) || "—" : "",
      eraSort: eraRaw || team.name,
    });
  }
  return options.sort((a, b) => {
    const gi = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
    if (gi) return gi;
    const club = a.label.localeCompare(b.label);
    if (club) return club;
    return a.eraSort.localeCompare(b.eraSort);
  });
}

export function teamsInGroup(options: MenuTeamOption[], group: MenuTeamGroup): MenuTeamOption[] {
  return options.filter((o) => o.group === group);
}

/**
 * Unique clubs for the Team dial (one row per clubKey).
 * Representative id is the first era chronologically.
 */
export function uniqueClubsInGroup(options: MenuTeamOption[], group: MenuTeamGroup): MenuTeamOption[] {
  const seen = new Set<string>();
  const out: MenuTeamOption[] = [];
  for (const opt of teamsInGroup(options, group)) {
    if (seen.has(opt.clubKey)) continue;
    seen.add(opt.clubKey);
    const eras = erasForClub(options, opt.clubKey);
    out.push(eras[0] ?? opt);
  }
  return out;
}

/** All era variants for a Classic club, sorted. */
export function erasForClub(options: MenuTeamOption[], clubKey: string): MenuTeamOption[] {
  return options
    .filter((o) => o.clubKey === clubKey)
    .sort((a, b) => a.eraSort.localeCompare(b.eraSort));
}

export function findTeamOption(options: MenuTeamOption[], teamId: string): MenuTeamOption | undefined {
  return options.find((o) => o.id === teamId);
}

/** League-select dial label for a team's group. */
export function secondaryDialLabel(option: MenuTeamOption): string {
  return MENU_TEAM_GROUP_LABEL[option.group];
}

/** Continuous opposition roll label — classics keep a short era tag. */
export function oppositionRollLabel(option: MenuTeamOption): string {
  if (option.group === "CLASSIC" && option.eraLabel && option.eraLabel !== "—") {
    return `${option.label} ${option.eraLabel}`;
  }
  return option.label;
}

/**
 * Flat opposition list in league order, excluding the user's club (all eras).
 * Already sorted by buildMenuTeamOptions — keep that order for continuous scrolling.
 */
export function oppositionRollOptions(
  options: MenuTeamOption[],
  userTeamId: string,
): MenuTeamOption[] {
  const user = findTeamOption(options, userTeamId);
  const userKey = user?.clubKey ?? userTeamId;
  return options.filter((o) => o.id !== userTeamId && o.clubKey !== userKey);
}

/** Index of the current opposition on the continuous roll (era → club fallback). */
export function oppositionRollIndex(
  roll: MenuTeamOption[],
  oppositionTeamId: string,
): number {
  const exact = roll.findIndex((o) => o.id === oppositionTeamId);
  if (exact >= 0) return exact;
  const opt = findTeamOption(roll, oppositionTeamId);
  if (!opt) return 0;
  const byClub = roll.findIndex((o) => o.clubKey === opt.clubKey);
  return Math.max(0, byClub);
}
