/**
 * Real-world match recipes for recreating proper fixtures in the sim lab.
 * Pairings/dates/scores are resolved from officialSeasonMatches() (baked + overlay).
 */

import {
  officialSeasonMatches,
  type OfficialCompetition,
  type OfficialMatch,
} from "../../data/officialResults";

export interface RealMatchReplaySpec {
  /** Stable id for reports / snapshots (also used as training corpus id when present). */
  id: string;
  /** Official calendar date (YYYY-MM-DD). */
  date: string;
  homeTeamId: string;
  awayTeamId: string;
  competition: OfficialCompetition;
  /** Seeded Math.random for reproducible sim recreation of this fixture. */
  seed: number;
  /** Simulated clock length (both halves share this total in MatchClock). */
  matchDurationSeconds: number;
  stepSeconds: number;
  stepsPerYield: number;
  /**
   * Optional path under public/data/training/ with labeled real match events
   * for AI training / play-style calibration (see football/training/).
   */
  trainingCorpusFile?: string;
}

/** League One — Stevenage v Plymouth Argyle, 20 Oct 2026 19:45 (official listing). */
export const REAL_STEVENAGE_PLYMOUTH_2026_10_20: RealMatchReplaySpec = {
  id: "l1_2026-10-20_stevenage_plymouth",
  date: "2026-10-20",
  homeTeamId: "stevenage_current",
  awayTeamId: "plymouth_argyle_current",
  competition: "League One",
  seed: 20261020,
  matchDurationSeconds: 120,
  stepSeconds: 1 / 20,
  stepsPerYield: 240,
};

/** Shorter CI smoke of the same official listing. */
export const REAL_STEVENAGE_PLYMOUTH_SMOKE: RealMatchReplaySpec = {
  ...REAL_STEVENAGE_PLYMOUTH_2026_10_20,
  id: "l1_2026-10-20_stevenage_plymouth_smoke",
  matchDurationSeconds: 60,
  stepSeconds: 1 / 15,
  stepsPerYield: 220,
};

/** League One — Plymouth 2–1 AFC Wimbledon, 10 Oct 2026 (played + training corpus). */
export const REAL_PLYMOUTH_WIMBLEDON_2026_10_10: RealMatchReplaySpec = {
  id: "l1_2026-10-10_plymouth_wimbledon",
  date: "2026-10-10",
  homeTeamId: "plymouth_argyle_current",
  awayTeamId: "afc_wimbledon_current",
  competition: "League One",
  seed: 20261010,
  matchDurationSeconds: 90,
  stepSeconds: 1 / 20,
  stepsPerYield: 240,
  trainingCorpusFile: "plymouth_wimbledon_2026-10-10.json",
};

/** League One — Blackpool 2–4 Plymouth, 19 Sep 2026 (played away win). */
export const REAL_BLACKPOOL_PLYMOUTH_2026_09_19: RealMatchReplaySpec = {
  id: "l1_2026-09-19_blackpool_plymouth",
  date: "2026-09-19",
  homeTeamId: "blackpool_current",
  awayTeamId: "plymouth_argyle_current",
  competition: "League One",
  seed: 20260919,
  matchDurationSeconds: 90,
  stepSeconds: 1 / 20,
  stepsPerYield: 240,
  trainingCorpusFile: "blackpool_plymouth_2026-09-19.json",
};

/** League One — Plymouth 0–2 Huddersfield, 17 Oct 2026 (played). */
export const REAL_PLYMOUTH_HUDDERSFIELD_2026_10_17: RealMatchReplaySpec = {
  id: "l1_2026-10-17_plymouth_huddersfield",
  date: "2026-10-17",
  homeTeamId: "plymouth_argyle_current",
  awayTeamId: "huddersfield_town_current",
  competition: "League One",
  seed: 20261017,
  matchDurationSeconds: 90,
  stepSeconds: 1 / 20,
  stepsPerYield: 240,
  trainingCorpusFile: "plymouth_huddersfield_2026-10-17.json",
};

/** Curated real-world set used by regression / rebuild tests. */
export const REAL_MATCH_REPLAY_SET: RealMatchReplaySpec[] = [
  REAL_STEVENAGE_PLYMOUTH_2026_10_20,
  REAL_STEVENAGE_PLYMOUTH_SMOKE,
  REAL_PLYMOUTH_WIMBLEDON_2026_10_10,
  REAL_BLACKPOOL_PLYMOUTH_2026_09_19,
  REAL_PLYMOUTH_HUDDERSFIELD_2026_10_17,
];

/** @deprecated Prefer REAL_STEVENAGE_PLYMOUTH_2026_10_20 — kept for import stability. */
export const BUILDUP_REPLAY_V1 = REAL_STEVENAGE_PLYMOUTH_2026_10_20;
/** @deprecated Prefer REAL_STEVENAGE_PLYMOUTH_SMOKE. */
export const BUILDUP_REPLAY_SMOKE = REAL_STEVENAGE_PLYMOUTH_SMOKE;
/** @deprecated Prefer REAL_MATCH_REPLAY_SET. */
export const REPLAY_FIXTURES = REAL_MATCH_REPLAY_SET;

export function resolveOfficialMatch(
  spec: Pick<RealMatchReplaySpec, "date" | "homeTeamId" | "awayTeamId" | "competition" | "id">,
  catalog: OfficialMatch[] = officialSeasonMatches(),
): OfficialMatch {
  const found = catalog.find(
    (m) =>
      m.date === spec.date &&
      m.homeTeamId === spec.homeTeamId &&
      m.awayTeamId === spec.awayTeamId &&
      m.competition === spec.competition,
  );
  if (!found) {
    throw new Error(
      `Official match not found: ${spec.id} (${spec.competition} ${spec.date} ${spec.homeTeamId} v ${spec.awayTeamId})`,
    );
  }
  return found;
}

export function labelOfficialMatch(match: OfficialMatch): string {
  const kickoff = match.time ? ` ${match.time}` : "";
  const score =
    match.played && match.homeScore != null && match.awayScore != null
      ? ` ${match.homeScore}-${match.awayScore}`
      : " (listed)";
  return `${match.competition} ${match.date}${kickoff} — ${match.homeTeamId} v ${match.awayTeamId}${score}`;
}

/** All official listings involving a club (played + remaining). */
export function officialMatchesForTeam(
  teamId: string,
  catalog: OfficialMatch[] = officialSeasonMatches(),
): OfficialMatch[] {
  return catalog
    .filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
