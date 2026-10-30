import type { EnglishLeague, FixtureRecord, TeamRecord } from "../../data/schema";
import { LEAGUE_COMPETITION } from "../../data/leagueSchedule";
import { POINTS_DEDUCTIONS } from "../../data/officialResults";

export interface TableRow {
  teamId: string;
  name: string;
  abbreviation: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
}

export const LEAGUE_TABS: { id: EnglishLeague; label: string }[] = [
  { id: "PREMIER_LEAGUE", label: "Premier League" },
  { id: "CHAMPIONSHIP", label: "Championship" },
  { id: "LEAGUE_ONE", label: "League One" },
  { id: "LA_LIGA", label: "La Liga" },
  { id: "SERIE_A", label: "Serie A" },
];

export function competitionForLeague(league: EnglishLeague): string {
  return LEAGUE_COMPETITION[league];
}

export function isEnglishLeagueCompetition(competition: string): boolean {
  return (Object.values(LEAGUE_COMPETITION) as string[]).includes(competition);
}

export function leagueForTeam(team: TeamRecord | undefined): EnglishLeague {
  return team?.league ?? "LEAGUE_ONE";
}

export function standingsFor(
  fixtures: FixtureRecord[],
  teams: TeamRecord[],
  league: EnglishLeague,
): TableRow[] {
  const competition = competitionForLeague(league);
  const clubs = teams
    .filter((t) => t.teamType === "CURRENT_TEAM" && t.league === league)
    .sort((a, b) => a.name.localeCompare(b.name));
  const rows = new Map<string, TableRow>();
  for (const club of clubs) {
    rows.set(club.id, emptyRow(club));
  }
  for (const fixture of fixtures) {
    if (fixture.competition !== competition || !fixture.played) continue;
    const home = rows.get(fixture.homeTeamId);
    const away = rows.get(fixture.awayTeamId);
    if (!home || !away) continue;
    const hs = fixture.homeScore ?? 0;
    const as = fixture.awayScore ?? 0;
    applyResult(home, hs, as);
    applyResult(away, as, hs);
  }
  for (const row of rows.values()) {
    const deduction = POINTS_DEDUCTIONS[row.teamId];
    if (deduction) row.pts -= deduction;
  }
  return [...rows.values()].sort(compareTable);
}

function emptyRow(team: TeamRecord): TableRow {
  return {
    teamId: team.id,
    name: team.name,
    abbreviation: team.abbreviation,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    pts: 0,
  };
}

function applyResult(row: TableRow, scored: number, conceded: number): void {
  row.played += 1;
  row.gf += scored;
  row.ga += conceded;
  row.gd = row.gf - row.ga;
  if (scored > conceded) {
    row.won += 1;
    row.pts += 3;
  } else if (scored === conceded) {
    row.drawn += 1;
    row.pts += 1;
  } else {
    row.lost += 1;
  }
}

function compareTable(a: TableRow, b: TableRow): number {
  return b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name);
}
