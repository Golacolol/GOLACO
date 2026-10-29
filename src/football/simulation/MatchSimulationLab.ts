/**
 * Match Simulation Lab — AI-v-AI batch runner using the real Match engine.
 * Classic Teams are EXCLUDED from random pools by default.
 */
import type { GameDatabase } from "../../core/Database";
import type { EventBus } from "../../core/EventBus";
import type { FixtureRecord, TeamRecord } from "../../data/schema";
import { getClassicTeamDefinitions } from "../../data/classicTeams";
import { Match } from "../Match";
import { FootballState } from "../FootballState";
import { MatchCamera } from "../camera/MatchCamera";
import { InputIntent } from "../controls/InputIntent";
import { decisionTelemetry } from "../ai/DecisionTelemetry";
import * as THREE from "three";

export const CLASSIC_TEAM_IDS = new Set(getClassicTeamDefinitions().map((t) => t.teamId));

export function isClassicTeamId(teamId: string): boolean {
  return CLASSIC_TEAM_IDS.has(teamId) || teamId.startsWith("classic_");
}

export function isClassicTeamRecord(team: TeamRecord): boolean {
  return isClassicTeamId(team.id);
}

export type SimulationPoolMode = "CURRENT" | "CLASSIC_INCLUDED" | "CLASSIC_ONLY" | "FIXED";

export interface SimulationLabOptions {
  matchCount: number;
  includeCurrentTeams: boolean;
  /** Random-pool Classic inclusion. Default OFF. */
  includeClassicTeams: boolean;
  homeTeamId: string | "AUTO";
  awayTeamId: string | "AUTO";
  matchDurationSeconds: number;
  recordTelemetry: boolean;
  seed: number | "AUTO";
  /** Steps of simulated time per wall-frame yield (accelerated). */
  stepSeconds?: number;
  stepsPerYield?: number;
}

export interface SimulatedMatchRecord {
  simulationRunId: string;
  matchId: string;
  seed: number | null;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamClassic: boolean;
  awayTeamClassic: boolean;
  homeScore: number;
  awayScore: number;
  result: "HOME" | "AWAY" | "DRAW" | "FAILED";
  simulatedMatchSeconds: number;
  wallClockMs: number;
  error?: string;
  stats?: {
    passes: number;
    shortPasses: number;
    completedPasses: number;
    passCompletion: number;
    shots: number;
    longShots: number;
    crosses: number;
    longPasses: number;
    crossFieldPasses: number;
    throughBalls: number;
    tackles: number;
    turnovers: number;
    stuckRecoveries: number;
    possessionChanges: number;
    offsides: number;
    progressivePasses: number;
    progressivePassDistance: number;
    passDistanceSum: number;
    meanPassLengthM: number;
    progressiveShare: number;
    meanPossessionDuration: number;
    homePlayStyle?: string;
    awayPlayStyle?: string;
    phaseShares?: Record<string, number>;
    meanStOffsideGap?: number;
    offsidesPer90?: number;
    turnoversPer90?: number;
    stuckRecoveriesPer90?: number;
  };
  /** DecisionTelemetry JSON when recordTelemetry was on. */
  telemetryJson?: string;
}

export interface TeamSimAggregate {
  teamId: string;
  classic: boolean;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  shots: number;
  passCompletionSum: number;
  passCompletionSamples: number;
}

export interface SimulationRunReport {
  simulationRunId: string;
  timestamp: string;
  gameVersion: string;
  attributeModelVersion: string;
  teamDatabaseVersion: string;
  classicTeamsIncluded: boolean;
  includeCurrentTeams: boolean;
  seed: number | "AUTO";
  simulationMode: SimulationPoolMode;
  telemetryEnabled: boolean;
  headlessStatus: "ACCELERATED_RENDERED" | "NOT_IMPLEMENTED";
  matchesRequested: number;
  matchesCompleted: number;
  matchesFailed: number;
  matches: SimulatedMatchRecord[];
  aggregates: {
    goalsPerMatch: number;
    homeWinPct: number;
    drawPct: number;
    awayWinPct: number;
    meanPassCompletion: number;
    meanShots: number;
    meanTurnovers: number;
    meanStuckRecoveries: number;
    meanWallMsPerMatch: number;
    currentVsCurrent: number;
    classicVsClassic: number;
    classicVsCurrent: number;
  };
  teams: TeamSimAggregate[];
}

export const CLASSIC_STRESS_FIXTURES: Array<{ home: string; away: string; label: string }> = [
  { home: "classic_milan_2004_05", away: "classic_barcelona_2014_15", label: "AC Milan 04/05 vs Barcelona 14/15" },
  { home: "classic_manutd_1998_99", away: "classic_arsenal_2003_04", label: "Man Utd 98/99 vs Arsenal 03/04" },
  { home: "classic_inter_2009_10", away: "classic_realmadrid_2002_03", label: "Inter 09/10 vs Real Madrid 02/03" },
  { home: "classic_liverpool_1987_88", away: "classic_barcelona_2008_09", label: "Liverpool 87/88 vs Barcelona 08/09" },
  { home: "classic_juventus_1995_96", away: "classic_chelsea_2004_05", label: "Juventus 95/96 vs Chelsea 04/05" },
  { home: "classic_ajax_1994_95", away: "classic_mancity_2018_19", label: "Ajax 94/95 vs Man City 18/19" },
  { home: "classic_inter_1997_98", away: "classic_juventus_2016_17", label: "Inter 97/98 vs Juventus 16/17" },
  { home: "classic_newcastle_1995_96", away: "classic_barcelona_1993_94", label: "Newcastle 95/96 vs Barcelona 93/94" },
  { home: "classic_england_1996", away: "classic_brazil_1994", label: "England 96 vs Brazil 94" },
  { home: "classic_england_2002", away: "classic_brazil_2002", label: "England 02 vs Brazil 02" },
  { home: "classic_france_2000", away: "classic_spain_2010", label: "France 00 vs Spain 10" },
  { home: "classic_argentina_1986", away: "classic_brazil_2002", label: "Argentina 86 vs Brazil 02" },
  { home: "classic_plymouth_argyle_1995_96", away: "classic_plymouth_argyle_2003_04", label: "Plymouth Argyle 95/96 vs 03/04" },
  { home: "classic_plymouth_argyle_2003_04", away: "classic_plymouth_argyle_2016_17", label: "Plymouth Argyle 03/04 vs 16/17" },
  // V3 era-pair stress (simulation outcomes are not historical verdicts)
  { home: "classic_milan_1993_94", away: "classic_milan_2004_05", label: "AC Milan 93/94 vs 04/05" },
  { home: "classic_realmadrid_1997_98", away: "classic_realmadrid_2002_03", label: "Real Madrid 97/98 vs 02/03" },
  { home: "classic_realmadrid_2002_03", away: "classic_realmadrid_2016_17", label: "Real Madrid 02/03 vs 16/17" },
  { home: "classic_manutd_1992_93", away: "classic_manutd_1998_99", label: "Man Utd 92/93 vs 98/99" },
  { home: "classic_liverpool_1995_96", away: "classic_liverpool_2007_08", label: "Liverpool 95/96 vs 07/08" },
  { home: "classic_liverpool_1987_88", away: "classic_liverpool_2007_08", label: "Liverpool 87/88 vs 07/08" },
  { home: "classic_bayern_2000_01", away: "classic_bayern_2012_13", label: "Bayern 00/01 vs 12/13" },
  { home: "classic_lazio_1999_00", away: "classic_juventus_1995_96", label: "Lazio 99/00 vs Juventus 95/96" },
  { home: "classic_tottenham_1994_95", away: "classic_arsenal_2003_04", label: "Tottenham 94/95 vs Arsenal 03/04" },
  { home: "classic_leeds_1999_00", away: "classic_chelsea_2004_05", label: "Leeds 99/00 vs Chelsea 04/05" },
  { home: "classic_nottingham_forest_1979_80", away: "classic_ajax_1994_95", label: "Forest 79/80 vs Ajax 94/95" },
  { home: "classic_milan_1993_94", away: "classic_realmadrid_2016_17", label: "AC Milan 93/94 vs Real Madrid 16/17" },
  { home: "classic_manutd_1992_93", away: "classic_liverpool_2007_08", label: "Man Utd 92/93 vs Liverpool 07/08" },
  { home: "classic_tottenham_1990_91", away: "classic_tottenham_1994_95", label: "Tottenham 90/91 vs 94/95" },
  { home: "classic_chelsea_1996_97", away: "classic_chelsea_2004_05", label: "Chelsea 96/97 vs 04/05" },
];

export const ARGYLE_ERA_FIXTURES = [
  { home: "classic_plymouth_argyle_1995_96", away: "classic_plymouth_argyle_2003_04" },
  { home: "classic_plymouth_argyle_2003_04", away: "classic_plymouth_argyle_2016_17" },
  { home: "classic_plymouth_argyle_1995_96", away: "classic_plymouth_argyle_2016_17" },
];

export function resolveSimulationMode(opts: SimulationLabOptions): SimulationPoolMode {
  if (opts.homeTeamId !== "AUTO" && opts.awayTeamId !== "AUTO") return "FIXED";
  if (opts.includeClassicTeams && !opts.includeCurrentTeams) return "CLASSIC_ONLY";
  if (opts.includeClassicTeams && opts.includeCurrentTeams) return "CLASSIC_INCLUDED";
  return "CURRENT";
}

export function eligibleTeamPool(db: GameDatabase, opts: Pick<SimulationLabOptions, "includeCurrentTeams" | "includeClassicTeams">): TeamRecord[] {
  const teams = [...db.teams.values()].filter((t) => t.teamType !== "FANS_TEAM" && t.teamType !== "YOUTH_TEAM");
  return teams.filter((t) => {
    const classic = isClassicTeamRecord(t);
    if (classic) return opts.includeClassicTeams;
    return opts.includeCurrentTeams;
  });
}

export function pickRandomPair(
  pool: TeamRecord[],
  homeId: string | "AUTO",
  awayId: string | "AUTO",
  rng: () => number,
): { home: string; away: string } {
  const ids = pool.map((t) => t.id);
  const pick = (exclude?: string) => {
    const candidates = exclude ? ids.filter((id) => id !== exclude) : ids;
    return candidates[Math.floor(rng() * candidates.length)]!;
  };
  const home = homeId === "AUTO" ? pick() : homeId;
  let away = awayId === "AUTO" ? pick(home) : awayId;
  if (away === home) away = pick(home);
  return { home, away };
}

/** Deterministic PRNG for lab / replay fixtures (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Patch Math.random for a sync or async block so Match internals are reproducible. */
export async function withSeededMathRandom<T>(seed: number, fn: () => Promise<T> | T): Promise<T> {
  const rng = mulberry32(seed);
  const original = Math.random;
  Math.random = rng;
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
}

export function buildLabFixture(db: GameDatabase, homeTeamId: string, awayTeamId: string, durationSeconds: number, matchId: string): FixtureRecord {
  const homeLineupId = db.defaultLineupId(homeTeamId) ?? `${homeTeamId}_xi`;
  const awayLineupId = db.defaultLineupId(awayTeamId) ?? `${awayTeamId}_xi`;
  return {
    id: matchId,
    date: "2099-01-01",
    competition: "EXHIBITION",
    homeTeamId,
    awayTeamId,
    venueId: db.getTeam(homeTeamId).defaultStadiumId,
    homeLineupId,
    awayLineupId,
    durationSeconds,
    time: "15:00",
    played: false,
  };
}

/** Build a lab FixtureRecord from a real OfficialMatch (date, KO, competition, score). */
export function buildLabFixtureFromOfficial(
  db: GameDatabase,
  official: {
    date: string;
    time?: string;
    competition: string;
    homeTeamId: string;
    awayTeamId: string;
    homeScore?: number;
    awayScore?: number;
    played: boolean;
  },
  durationSeconds: number,
  matchId: string,
): FixtureRecord {
  const homeLineupId = db.defaultLineupId(official.homeTeamId) ?? `${official.homeTeamId}_xi`;
  const awayLineupId = db.defaultLineupId(official.awayTeamId) ?? `${official.awayTeamId}_xi`;
  const hour = Number((official.time ?? "15:00").slice(0, 2));
  const timeOfDay: FixtureRecord["timeOfDay"] = hour >= 19 ? "NIGHT" : hour >= 17 ? "EVENING" : "DAY";
  return {
    id: matchId,
    date: official.date,
    time: official.time ?? "15:00",
    competition: official.competition,
    homeTeamId: official.homeTeamId,
    awayTeamId: official.awayTeamId,
    venueId: db.getTeam(official.homeTeamId).defaultStadiumId,
    homeLineupId,
    awayLineupId,
    durationSeconds,
    gameplayModeDefault: "REAL",
    timeOfDay,
    played: official.played,
    homeScore: official.homeScore,
    awayScore: official.awayScore,
    official: true,
    simulated: false,
  };
}

export interface LabRunnerHost {
  scene: THREE.Scene;
  camera: MatchCamera;
  db: GameDatabase;
  events: EventBus;
}

export type LabProgress = {
  index: number;
  total: number;
  fixtureLabel: string;
  classicIncluded: boolean;
  telemetry: boolean;
  completed: number;
  errors: number;
  elapsedWallMs: number;
};

/**
 * Runs one autoplay match to full time with accelerated fixed timesteps.
 * Uses the same Match class as normal play (not a score generator).
 * Three.js objects are still constructed — true headless is NOT IMPLEMENTED.
 */
export async function simulateOneMatch(
  host: LabRunnerHost,
  fixture: FixtureRecord,
  opts: {
    seed: number | null;
    recordTelemetry: boolean;
    stepSeconds?: number;
    stepsPerYield?: number;
    shouldStop?: () => boolean;
  },
): Promise<SimulatedMatchRecord> {
  const wallStart = performance.now();
  const homeClassic = isClassicTeamId(fixture.homeTeamId);
  const awayClassic = isClassicTeamId(fixture.awayTeamId);
  const base: SimulatedMatchRecord = {
    simulationRunId: "",
    matchId: fixture.id,
    seed: opts.seed,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    homeTeamClassic: homeClassic,
    awayTeamClassic: awayClassic,
    homeScore: 0,
    awayScore: 0,
    result: "FAILED",
    simulatedMatchSeconds: 0,
    wallClockMs: 0,
  };

  decisionTelemetry.configure({
    enabled: opts.recordTelemetry,
    matchId: fixture.id,
  });
    if (opts.recordTelemetry) decisionTelemetry.reset(fixture.id);

  let match: Match | null = null;
  try {
    // Build the scene with the real Math.random (Three.js UUIDs). Seed only the
    // gameplay loop so the same seed recreates decisions / ball noise.
    match = new Match(
      host.scene,
      host.camera,
      host.db,
      {
        fixture,
        preferredPlayerId: "",
        userSide: "home",
        autoplay: true,
        gameplayMode: "REAL",
        graphicsPreset: "LOW",
      },
      host.events,
    );

    const simulate = async (): Promise<void> => {
      if (!match) return;
      match.startPlay();
      const step = opts.stepSeconds ?? 1 / 30;
      const perYield = opts.stepsPerYield ?? 90;
      const intent = new InputIntent();
      let steps = 0;
      const maxSteps = Math.ceil((fixture.durationSeconds + 120) / step) * 3;
      while (match.state !== FootballState.FULL_TIME && steps < maxSteps) {
        if (opts.shouldStop?.()) {
          base.error = "stopped";
          break;
        }
        intent.resetEdges();
        if (match.state === FootballState.HALF_TIME) {
          // Drain half-time pause quickly (same engine path as live play).
          match.update(30, intent);
        } else {
          match.update(step, intent);
        }
        steps += 1;
        if (steps % perYield === 0) await new Promise<void>((r) => setTimeout(r, 0));
      }
      if (match.state === FootballState.FULL_TIME) {
        base.homeScore = match.homeScore;
        base.awayScore = match.awayScore;
        base.result =
          match.homeScore > match.awayScore ? "HOME" : match.awayScore > match.homeScore ? "AWAY" : "DRAW";
        base.simulatedMatchSeconds = match.clock.elapsed;
        const passes = Math.max(1, match.stats.passes);
        const possDurs = match.stats.possessionDurations;
        const matchSeconds = Math.max(1, match.clock.elapsed);
        const per90 = (n: number) => (n / matchSeconds) * 90 * 60;
        const phaseTotal =
          Object.values(match.stats.phaseSeconds).reduce((a, b) => a + b, 0) || 1;
        const phaseShares: Record<string, number> = {};
        for (const [k, v] of Object.entries(match.stats.phaseSeconds)) {
          phaseShares[k] = v / phaseTotal;
        }
        const stGaps = match.stats.stOffsideGapSamples;
        base.stats = {
          passes: match.stats.passes,
          shortPasses: match.stats.shortPasses,
          completedPasses: match.stats.completedPasses,
          passCompletion: match.passCompletion,
          shots: match.stats.shots,
          longShots: match.stats.longShots,
          crosses: match.stats.crosses,
          longPasses: match.stats.longPasses,
          crossFieldPasses: match.stats.crossFieldPasses,
          throughBalls: match.stats.throughBalls,
          tackles: match.stats.tackles,
          turnovers: match.stats.turnovers,
          stuckRecoveries: match.stats.stuckRecoveries,
          possessionChanges: match.stats.possessionChanges,
          offsides: match.stats.offsides,
          progressivePasses: match.stats.progressivePasses,
          progressivePassDistance: match.stats.progressivePassDistance,
          passDistanceSum: match.stats.passDistanceSum,
          meanPassLengthM: match.stats.passDistanceSum / passes,
          progressiveShare: match.stats.progressivePasses / passes,
          meanPossessionDuration:
            possDurs.length > 0 ? possDurs.reduce((a, b) => a + b, 0) / possDurs.length : 0,
          homePlayStyle: match.homePlayStyle?.id,
          awayPlayStyle: match.awayPlayStyle?.id,
          phaseShares,
          meanStOffsideGap:
            stGaps.length > 0 ? stGaps.reduce((a, b) => a + b, 0) / stGaps.length : 0,
          offsidesPer90: per90(match.stats.offsides),
          turnoversPer90: per90(match.stats.turnovers),
          stuckRecoveriesPer90: per90(match.stats.stuckRecoveries),
        };
        if (opts.recordTelemetry) {
          base.telemetryJson = decisionTelemetry.dumpJson();
        }
      } else if (!base.error) {
        base.error = `did_not_finish:${match.state}`;
      }
    };

    if (opts.seed != null) await withSeededMathRandom(opts.seed, simulate);
    else await simulate();
  } catch (err) {
    base.error = err instanceof Error ? err.message : String(err);
    base.result = "FAILED";
  } finally {
    match?.dispose();
    decisionTelemetry.configure({ enabled: false });
    base.wallClockMs = performance.now() - wallStart;
  }
  return base;
}

export async function runSimulationLab(
  host: LabRunnerHost,
  options: SimulationLabOptions,
  onProgress?: (p: LabProgress) => void,
  control?: { stopAfterCurrent: boolean; stopNow: boolean },
): Promise<SimulationRunReport> {
  const runId = `sim_${Date.now().toString(36)}`;
  const mode = resolveSimulationMode(options);
  const seedBase = options.seed === "AUTO" ? (Date.now() % 1e9) | 0 : options.seed;
  const rng = mulberry32(seedBase);
  const pool = eligibleTeamPool(host.db, options);
  if (mode !== "FIXED" && pool.length < 2) {
    throw new Error("Team pool has fewer than 2 eligible teams for this simulation mode");
  }

  const matches: SimulatedMatchRecord[] = [];
  const teamMap = new Map<string, TeamSimAggregate>();
  const ensure = (id: string) => {
    let row = teamMap.get(id);
    if (!row) {
      row = {
        teamId: id,
        classic: isClassicTeamId(id),
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        gf: 0,
        ga: 0,
        shots: 0,
        passCompletionSum: 0,
        passCompletionSamples: 0,
      };
      teamMap.set(id, row);
    }
    return row;
  };

  const wall0 = performance.now();
  for (let i = 0; i < options.matchCount; i++) {
    if (control?.stopNow) break;
    const pair = pickRandomPair(pool.length >= 2 ? pool : [...host.db.teams.values()], options.homeTeamId, options.awayTeamId, rng);
    // Explicit Classic selection is allowed even when random Classic inclusion is OFF.
    const homeId = options.homeTeamId === "AUTO" ? pair.home : options.homeTeamId;
    const awayId = options.awayTeamId === "AUTO" ? pair.away : options.awayTeamId;
    const label = `${host.db.getTeam(homeId).name} vs ${host.db.getTeam(awayId).name}`;
    onProgress?.({
      index: i + 1,
      total: options.matchCount,
      fixtureLabel: label,
      classicIncluded: options.includeClassicTeams,
      telemetry: options.recordTelemetry,
      completed: matches.filter((m) => m.result !== "FAILED").length,
      errors: matches.filter((m) => m.result === "FAILED").length,
      elapsedWallMs: performance.now() - wall0,
    });

    const fixture = buildLabFixture(host.db, homeId, awayId, options.matchDurationSeconds, `${runId}_m${i + 1}`);
    const record = await simulateOneMatch(host, fixture, {
      seed: seedBase + i,
      recordTelemetry: options.recordTelemetry,
      stepSeconds: options.stepSeconds,
      stepsPerYield: options.stepsPerYield,
      shouldStop: () => !!control?.stopNow,
    });
    record.simulationRunId = runId;
    matches.push(record);

    if (record.result !== "FAILED") {
      const home = ensure(homeId);
      const away = ensure(awayId);
      home.played += 1;
      away.played += 1;
      home.gf += record.homeScore;
      home.ga += record.awayScore;
      away.gf += record.awayScore;
      away.ga += record.homeScore;
      if (record.result === "HOME") {
        home.won += 1;
        away.lost += 1;
      } else if (record.result === "AWAY") {
        away.won += 1;
        home.lost += 1;
      } else {
        home.drawn += 1;
        away.drawn += 1;
      }
      if (record.stats) {
        home.shots += record.stats.shots;
        away.shots += record.stats.shots;
        home.passCompletionSum += record.stats.passCompletion;
        home.passCompletionSamples += 1;
      }
    }

    if (control?.stopAfterCurrent) break;
  }

  const completed = matches.filter((m) => m.result !== "FAILED");
  const failed = matches.length - completed.length;
  const goals = completed.reduce((s, m) => s + m.homeScore + m.awayScore, 0);
  const homeWins = completed.filter((m) => m.result === "HOME").length;
  const draws = completed.filter((m) => m.result === "DRAW").length;
  const awayWins = completed.filter((m) => m.result === "AWAY").length;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  return {
    simulationRunId: runId,
    timestamp: new Date().toISOString(),
    gameVersion: "argyle-football",
    attributeModelVersion: "V1",
    teamDatabaseVersion: "classic-teams-2.0",
    classicTeamsIncluded: options.includeClassicTeams,
    includeCurrentTeams: options.includeCurrentTeams,
    seed: options.seed === "AUTO" ? seedBase : options.seed,
    simulationMode: mode,
    telemetryEnabled: options.recordTelemetry,
    headlessStatus: "ACCELERATED_RENDERED",
    matchesRequested: options.matchCount,
    matchesCompleted: completed.length,
    matchesFailed: failed,
    matches,
    aggregates: {
      goalsPerMatch: completed.length ? goals / completed.length : 0,
      homeWinPct: completed.length ? (100 * homeWins) / completed.length : 0,
      drawPct: completed.length ? (100 * draws) / completed.length : 0,
      awayWinPct: completed.length ? (100 * awayWins) / completed.length : 0,
      meanPassCompletion: mean(completed.map((m) => m.stats?.passCompletion ?? 0)),
      meanShots: mean(completed.map((m) => m.stats?.shots ?? 0)),
      meanTurnovers: mean(completed.map((m) => m.stats?.turnovers ?? 0)),
      meanStuckRecoveries: mean(completed.map((m) => m.stats?.stuckRecoveries ?? 0)),
      meanWallMsPerMatch: mean(matches.map((m) => m.wallClockMs)),
      currentVsCurrent: completed.filter((m) => !m.homeTeamClassic && !m.awayTeamClassic).length,
      classicVsClassic: completed.filter((m) => m.homeTeamClassic && m.awayTeamClassic).length,
      classicVsCurrent: completed.filter((m) => m.homeTeamClassic !== m.awayTeamClassic).length,
    },
    teams: [...teamMap.values()].sort((a, b) => b.won - a.won || b.gf - a.gf),
  };
}

export function exportReportJson(report: SimulationRunReport): string {
  return JSON.stringify(report, null, 2);
}

export function exportReportCsv(report: SimulationRunReport): string {
  const lines = [
    "matchId,homeTeamId,awayTeamId,homeClassic,awayClassic,homeScore,awayScore,result,wallClockMs,error",
  ];
  for (const m of report.matches) {
    lines.push(
      [
        m.matchId,
        m.homeTeamId,
        m.awayTeamId,
        m.homeTeamClassic,
        m.awayTeamClassic,
        m.homeScore,
        m.awayScore,
        m.result,
        Math.round(m.wallClockMs),
        m.error ?? "",
      ].join(","),
    );
  }
  return lines.join("\n");
}

export function compareAbReports(a: SimulationRunReport, b: SimulationRunReport) {
  return {
    goalsPerMatch: { a: a.aggregates.goalsPerMatch, b: b.aggregates.goalsPerMatch },
    shotsPerMatch: { a: a.aggregates.meanShots, b: b.aggregates.meanShots },
    passCompletion: { a: a.aggregates.meanPassCompletion, b: b.aggregates.meanPassCompletion },
    turnovers: { a: a.aggregates.meanTurnovers, b: b.aggregates.meanTurnovers },
    stuckRecoveries: { a: a.aggregates.meanStuckRecoveries, b: b.aggregates.meanStuckRecoveries },
  };
}
