import type { EnglishLeague, FixtureRecord, TeamRecord } from "./schema";
import { DEFAULT_KICK_OFF_TIME, DEFAULT_MATCH_DURATION } from "../football/constants";
import { officialSeasonMatches, pairingKey, type OfficialMatch } from "./officialResults";

export const SEASON_START = "2026-08-15";
export const REMAINDER_START = "2026-09-19";

export const LEAGUE_COMPETITION: Record<EnglishLeague, string> = {
  PREMIER_LEAGUE: "Premier League",
  CHAMPIONSHIP: "Championship",
  LEAGUE_ONE: "League One",
};

export function todayIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function roundRobinRounds(teamIds: string[]): [string, string][][] {
  const ids = [...teamIds];
  if (ids.length < 2) return [];
  if (ids.length % 2 === 1) ids.push("__bye__");
  const n = ids.length;
  const half = n / 2;
  const rounds: [string, string][][] = [];
  const wheel = ids.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const arr = [ids[0], ...wheel];
    const pairs: [string, string][] = [];
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a === "__bye__" || b === "__bye__") continue;
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    wheel.unshift(wheel.pop()!);
  }
  return rounds;
}

export function clubBadge(team: Pick<TeamRecord, "id" | "abbreviation">): string {
  return team.id === "plymouth_argyle_current" ? "PAFC" : team.abbreviation;
}

export function nextFixtureForTeam(
  fixtures: FixtureRecord[],
  teamId: string,
  asOf = todayIso(),
  options?: { skipPlayed?: boolean },
): FixtureRecord | null {
  const involving = fixtures.filter((f) => f.homeTeamId === teamId || f.awayTeamId === teamId);
  const pool = options?.skipPlayed ? involving.filter((f) => !f.played) : involving;
  if (!pool.length) return null;
  const upcoming = pool.filter((f) => f.date >= asOf).sort(byDateThenId);
  if (options?.skipPlayed) return upcoming[0] ?? [...pool].sort(byDateThenId)[0] ?? null;
  return upcoming[0] ?? [...pool].sort(byDateThenId)[0] ?? null;
}

export function buildEnglishLeagueFixtures(
  teams: TeamRecord[],
  template?: Partial<FixtureRecord>,
  lineupId?: (teamId: string) => string | undefined,
): FixtureRecord[] {
  const leagues: EnglishLeague[] = ["PREMIER_LEAGUE", "CHAMPIONSHIP", "LEAGUE_ONE"];
  const byId = new Map(teams.map((t) => [t.id, t]));
  const official = officialSeasonMatches().map((match) => fixtureFromOfficial(match, byId, template, lineupId));
  const used = new Set(official.map((f) => pairingKey(f.homeTeamId, f.awayTeamId, f.competition)));
  const occupied = occupiedTeamsByDate(official);
  const remStart = remainderCalendarStart(official);
  const officialDates = unplayedOfficialDatesByTeam(official);
  const generated: FixtureRecord[] = [];
  for (const league of leagues) {
    const clubs = teams
      .filter((t) => t.teamType === "CURRENT_TEAM" && t.league === league)
      .sort((a, b) => a.name.localeCompare(b.name));
    const competition = LEAGUE_COMPETITION[league];
    const remaining: [string, string][] = [];
    const rounds = roundRobinRounds(clubs.map((t) => t.id));
    for (const round of rounds) {
      for (const [homeId, awayId] of round) remaining.push([homeId, awayId]);
    }
    for (const round of rounds) {
      for (const [homeId, awayId] of round) remaining.push([awayId, homeId]);
    }
    const blockedDates = new Set(official.filter((f) => f.competition === competition).map((f) => f.date));
    generated.push(
      ...scheduleRemaining(
        remaining.filter((pair) => !used.has(pairingKey(pair[0], pair[1], competition))),
        competition,
        byId,
        template,
        lineupId,
        occupied,
        remStart,
        officialDates,
        blockedDates,
      ),
    );
  }
  return [...official, ...generated].sort(byDateThenId);
}

/** Fillers must start after the latest official result so catch-up cannot invent mid-season scores. */
export function remainderCalendarStart(official: Pick<FixtureRecord, "date" | "played" | "official">[]): string {
  let latest: string | null = null;
  for (const fixture of official) {
    if (!fixture.played || fixture.official === false) continue;
    if (!latest || fixture.date > latest) latest = fixture.date;
  }
  const afterOfficial = latest ? addDays(latest, 1) : REMAINDER_START;
  return afterOfficial > REMAINDER_START ? afterOfficial : REMAINDER_START;
}

function unplayedOfficialDatesByTeam(
  official: Pick<FixtureRecord, "date" | "played" | "homeTeamId" | "awayTeamId">[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const fixture of official) {
    if (fixture.played) continue;
    for (const teamId of [fixture.homeTeamId, fixture.awayTeamId]) {
      const list = map.get(teamId) ?? [];
      list.push(fixture.date);
      map.set(teamId, list);
    }
  }
  return map;
}

function nearOfficialDate(teamId: string, date: string, officialDates: Map<string, string[]>): boolean {
  const dates = officialDates.get(teamId);
  if (!dates?.length) return false;
  const t = Date.parse(`${date}T12:00:00Z`);
  return dates.some((d) => Math.abs(Date.parse(`${d}T12:00:00Z`) - t) <= 3 * 86_400_000);
}

function scheduleRemaining(
  pairs: [string, string][],
  competition: string,
  byId: Map<string, TeamRecord>,
  template: Partial<FixtureRecord> | undefined,
  lineupId: ((teamId: string) => string | undefined) | undefined,
  occupied: Map<string, Set<string>>,
  startDate = REMAINDER_START,
  officialDates = new Map<string, string[]>(),
  /** Dates that already have real/official fixtures — never invent fillers onto those cards. */
  blockedDates = new Set<string>(),
): FixtureRecord[] {
  const leftover = [...pairs];
  const out: FixtureRecord[] = [];
  let date = startDate;
  let guard = 0;
  while (leftover.length && guard < 400) {
    if (blockedDates.has(date)) {
      date = addDays(date, 1);
      guard += 1;
      continue;
    }
    const busy = new Set(occupied.get(date) ?? []);
    let placed = 0;
    for (let i = 0; i < leftover.length; ) {
      const [homeId, awayId] = leftover[i];
      if (
        busy.has(homeId) ||
        busy.has(awayId) ||
        nearOfficialDate(homeId, date, officialDates) ||
        nearOfficialDate(awayId, date, officialDates)
      ) {
        i += 1;
        continue;
      }
      leftover.splice(i, 1);
      busy.add(homeId);
      busy.add(awayId);
      out.push(makeFixture(homeId, awayId, date, competition, byId, template, lineupId, `rem_${date}`));
      placed += 1;
    }
    // Prefer weekly steps when a card was filled; otherwise nudge day-by-day past blocked dates.
    date = addDays(date, placed > 0 ? 7 : 1);
    guard += 1;
  }
  return out;
}

function occupiedTeamsByDate(fixtures: FixtureRecord[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const fixture of fixtures) {
    const teams = map.get(fixture.date) ?? new Set<string>();
    teams.add(fixture.homeTeamId);
    teams.add(fixture.awayTeamId);
    map.set(fixture.date, teams);
  }
  return map;
}

function fixtureFromOfficial(
  match: OfficialMatch,
  byId: Map<string, TeamRecord>,
  template: Partial<FixtureRecord> | undefined,
  lineupId: ((teamId: string) => string | undefined) | undefined,
): FixtureRecord {
  const fixture = makeFixture(
    match.homeTeamId,
    match.awayTeamId,
    match.date,
    match.competition,
    byId,
    template,
    lineupId,
    "off",
    match.time,
  );
  fixture.official = true;
  if (match.played) {
    fixture.played = true;
    fixture.homeScore = match.homeScore;
    fixture.awayScore = match.awayScore;
    fixture.simulated = false;
  }
  return fixture;
}

function makeFixture(
  homeId: string,
  awayId: string,
  date: string,
  competition: string,
  byId: Map<string, TeamRecord>,
  template: Partial<FixtureRecord> | undefined,
  lineupId: ((teamId: string) => string | undefined) | undefined,
  round: string,
  time = template?.time ?? DEFAULT_KICK_OFF_TIME,
): FixtureRecord {
  const home = byId.get(homeId);
  const slug = `${homeId}_${awayId}_${date}`.replace(/_current/g, "");
  return {
    id: `fix_${round}_${slug}`,
    homeTeamId: homeId,
    awayTeamId: awayId,
    venueId: home?.defaultStadiumId ?? template?.venueId ?? "home_park",
    competition,
    date,
    time,
    durationSeconds: template?.durationSeconds ?? DEFAULT_MATCH_DURATION,
    homeLineupId: lineupId?.(homeId) ?? template?.homeLineupId,
    awayLineupId: lineupId?.(awayId) ?? template?.awayLineupId,
    gameplayModeDefault: template?.gameplayModeDefault ?? "REAL",
    timeOfDay: template?.timeOfDay ?? "EVENING",
    weather: template?.weather ?? "MILD",
  };
}

function byDateThenId(a: FixtureRecord, b: FixtureRecord): number {
  return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
}
