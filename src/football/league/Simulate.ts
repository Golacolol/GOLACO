import type { FixtureRecord } from "../../data/schema";
import { isEnglishLeagueCompetition } from "./Standings";

export function markPlayed(fixture: FixtureRecord, homeScore: number, awayScore: number, simulated: boolean): void {
  fixture.played = true;
  fixture.homeScore = homeScore;
  fixture.awayScore = awayScore;
  fixture.simulated = simulated;
}

export function cachedStrength(compute: (teamId: string) => number): (teamId: string) => number {
  const map = new Map<string, number>();
  return (teamId) => {
    const hit = map.get(teamId);
    if (hit !== undefined) return hit;
    const value = compute(teamId);
    map.set(teamId, value);
    return value;
  };
}

export function simulateScore(fixture: FixtureRecord, homeStrength: number, awayStrength: number): { home: number; away: number } {
  const rng = mulberry32(hash32(`${fixture.id}:${fixture.date}`));
  const gap = homeStrength - awayStrength;
  const homeLambda = clamp(1.2 + gap / 26, 0.35, 3.4);
  const awayLambda = clamp(0.95 - gap / 30, 0.25, 3.1);
  return { home: poisson(homeLambda, rng), away: poisson(awayLambda, rng) };
}

export function simulateUnplayedOnDate(
  fixtures: FixtureRecord[],
  date: string,
  strengthOf: (teamId: string) => number,
  options?: { allowGeneratedFillers?: boolean },
): void {
  const allowFillers = options?.allowGeneratedFillers === true;
  for (const fixture of fixtures) {
    // Never invent scores for fixtures that belong to the official results table.
    if (fixture.official || fixture.date !== date || fixture.played || !isEnglishLeagueCompetition(fixture.competition)) continue;
    // Generated remainder fixtures are calendar padding — inventing scores pollutes real-world tables.
    if (!allowFillers && fixture.id.includes("rem_")) continue;
    const score = simulateScore(fixture, strengthOf(fixture.homeTeamId), strengthOf(fixture.awayTeamId));
    markPlayed(fixture, score.home, score.away, true);
  }
}

export function simulateDatesBefore(
  fixtures: FixtureRecord[],
  beforeDate: string,
  strengthOf: (teamId: string) => number,
  options?: { allowGeneratedFillers?: boolean },
): void {
  const dates = [
    ...new Set(
      fixtures
        .filter((f) => {
          if (f.played || f.date >= beforeDate || !isEnglishLeagueCompetition(f.competition)) return false;
          if (f.official) return false;
          if (options?.allowGeneratedFillers !== true && f.id.includes("rem_")) return false;
          return true;
        })
        .map((f) => f.date),
    ),
  ].sort();
  for (const date of dates) simulateUnplayedOnDate(fixtures, date, strengthOf, options);
}

export function applyUserMatchweek(
  fixtures: FixtureRecord[],
  fixtureId: string,
  homeScore: number,
  awayScore: number,
  strengthOf: (teamId: string) => number,
  simulated = false,
): FixtureRecord | null {
  const fixture = fixtures.find((f) => f.id === fixtureId);
  if (!fixture || fixture.played || !isEnglishLeagueCompetition(fixture.competition)) return null;
  markPlayed(fixture, homeScore, awayScore, simulated);
  // Career progression may invent the rest of that matchweek once the user advances past the official calendar.
  simulateUnplayedOnDate(fixtures, fixture.date, strengthOf, { allowGeneratedFillers: true });
  return fixture;
}

/** Simulate the listed league match and the rest of that matchweek. */
export function simulateUserMatchweek(
  fixtures: FixtureRecord[],
  fixtureId: string,
  strengthOf: (teamId: string) => number,
): FixtureRecord | null {
  const fixture = fixtures.find((f) => f.id === fixtureId);
  if (!fixture || fixture.played || !isEnglishLeagueCompetition(fixture.competition)) return null;
  const score = simulateScore(fixture, strengthOf(fixture.homeTeamId), strengthOf(fixture.awayTeamId));
  return applyUserMatchweek(fixtures, fixtureId, score.home, score.away, strengthOf, true);
}

export function fixtureDates(fixtures: FixtureRecord[], competition?: string): string[] {
  const dates = new Set<string>();
  for (const fixture of fixtures) {
    if (competition && fixture.competition !== competition) continue;
    if (!isEnglishLeagueCompetition(fixture.competition)) continue;
    dates.add(fixture.date);
  }
  return [...dates].sort();
}

export function pickWeekDate(dates: string[], asOf: string): string {
  if (!dates.length) return asOf;
  return dates.find((d) => d >= asOf) ?? dates[dates.length - 1];
}

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(lambda: number, rng: () => number): number {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng();
  } while (p > limit && k < 10);
  return k - 1;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
