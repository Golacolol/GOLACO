import type { FixtureRecord } from "../../data/schema";
import { addDays, todayIso } from "../../data/leagueSchedule";
import { isEnglishLeagueCompetition } from "../league/Standings";

export const PREDICTION_SLOT_COUNT = 10;
export const PREDICTION_SCORE_MAX = 9;

export interface PredictionPick {
  fixtureId: string;
  home: number;
  away: number;
  locked: boolean;
}

export interface PredictionWeek {
  /** Saturday ISO that starts the Sat–Thu match window. */
  weekStart: string;
  fixtureIds: string[];
  /** True when an admin chose the slate; false when auto-picked. */
  adminSet: boolean;
  picks: PredictionPick[];
  scored: boolean;
  weekPoints: number;
}

export interface PredictionsState {
  weeks: PredictionWeek[];
  totalPoints: number;
}

export function blankPredictions(): PredictionsState {
  return { weeks: [], totalPoints: 0 };
}

export function normalizePredictions(raw: unknown): PredictionsState {
  if (!raw || typeof raw !== "object") return blankPredictions();
  const src = raw as Partial<PredictionsState>;
  const weeks = Array.isArray(src.weeks)
    ? src.weeks.map(normalizeWeek).filter((w): w is PredictionWeek => !!w)
    : [];
  const totalPoints = weeks.reduce((s, w) => s + (w.scored ? w.weekPoints : 0), 0);
  return { weeks, totalPoints };
}

function normalizeWeek(raw: unknown): PredictionWeek | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Partial<PredictionWeek>;
  if (typeof w.weekStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(w.weekStart)) return null;
  const fixtureIds = Array.isArray(w.fixtureIds)
    ? w.fixtureIds.filter((id): id is string => typeof id === "string").slice(0, PREDICTION_SLOT_COUNT)
    : [];
  const picksRaw = Array.isArray(w.picks) ? w.picks : [];
  const picks = fixtureIds.map((fixtureId) => {
    const hit = picksRaw.find((p) => p && typeof p === "object" && (p as PredictionPick).fixtureId === fixtureId) as
      | PredictionPick
      | undefined;
    return {
      fixtureId,
      home: clampScore(hit?.home ?? 0),
      away: clampScore(hit?.away ?? 0),
      locked: hit?.locked === true,
    };
  });
  return {
    weekStart: w.weekStart,
    fixtureIds,
    adminSet: w.adminSet === true,
    picks,
    scored: w.scored === true,
    weekPoints: Number.isFinite(w.weekPoints) ? Math.max(0, Math.round(w.weekPoints as number)) : 0,
  };
}

export function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(PREDICTION_SCORE_MAX, Math.max(0, Math.round(n)));
}

/** UTC weekday: 0 Sun … 6 Sat. */
export function weekdayUtc(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

/**
 * Saturday that opens the active prediction window.
 * Fri → next Saturday (selection day for the coming Sat–Thu slate).
 * Sat–Thu → that week's Saturday.
 */
export function predictionWeekStart(asOf = todayIso()): string {
  const d = weekdayUtc(asOf);
  if (d === 5) return addDays(asOf, 1);
  if (d === 6) return asOf;
  const daysSinceSat = (d + 1) % 7;
  return addDays(asOf, -daysSinceSat);
}

export function predictionWeekEnd(weekStart: string): string {
  return addDays(weekStart, 5); // Thursday
}

export function shiftPredictionWeek(weekStart: string, deltaWeeks: number): string {
  return addDays(weekStart, deltaWeeks * 7);
}

/** Furthest forward week you can open: next Sat–Thu after the live window. */
export function maxPredictionWeekStart(asOf = todayIso()): string {
  return shiftPredictionWeek(predictionWeekStart(asOf), 1);
}

/** Earliest week worth browsing: oldest stored slate, else current. */
export function minPredictionWeekStart(state: PredictionsState, asOf = todayIso()): string {
  const current = predictionWeekStart(asOf);
  if (!state.weeks.length) return current;
  const oldest = [...state.weeks].map((w) => w.weekStart).sort()[0]!;
  return oldest < current ? oldest : current;
}

export function clampPredictionViewWeek(weekStart: string, state: PredictionsState, asOf = todayIso()): string {
  const min = minPredictionWeekStart(state, asOf);
  const max = maxPredictionWeekStart(asOf);
  if (weekStart < min) return min;
  if (weekStart > max) return max;
  return weekStart;
}

export function isInPredictionWindow(date: string, weekStart: string): boolean {
  return date >= weekStart && date <= predictionWeekEnd(weekStart);
}

/** Friday on or before the week Saturday — deadline to set the slate. */
export function predictionSelectionDeadline(weekStart: string): string {
  return addDays(weekStart, -1);
}

export function shouldAutoSelectWeek(week: PredictionWeek | undefined, weekStart: string, asOf = todayIso()): boolean {
  if (week?.fixtureIds.length === PREDICTION_SLOT_COUNT && week.adminSet) return false;
  if (week?.fixtureIds.length === PREDICTION_SLOT_COUNT && !week.adminSet) return false;
  const deadline = predictionSelectionDeadline(weekStart);
  return asOf >= deadline;
}

export type MatchOutcome = "HOME" | "AWAY" | "DRAW";

export function matchOutcome(home: number, away: number): MatchOutcome {
  if (home > away) return "HOME";
  if (away > home) return "AWAY";
  return "DRAW";
}

/**
 * 5 exact score + 1 correct home goals + 1 correct away goals + 1 correct W/D/L.
 */
export function scorePrediction(
  predHome: number,
  predAway: number,
  actualHome: number,
  actualAway: number,
): number {
  let pts = 0;
  if (predHome === actualHome && predAway === actualAway) pts += 5;
  if (predHome === actualHome) pts += 1;
  if (predAway === actualAway) pts += 1;
  if (matchOutcome(predHome, predAway) === matchOutcome(actualHome, actualAway)) pts += 1;
  return pts;
}

export function fixturesInWindow(fixtures: FixtureRecord[], weekStart: string): FixtureRecord[] {
  const end = predictionWeekEnd(weekStart);
  return fixtures
    .filter((f) => isEnglishLeagueCompetition(f.competition) && f.date >= weekStart && f.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** Prefer official unplayed ties, then other English league games in the window. */
export function autoSelectPredictionFixtures(fixtures: FixtureRecord[], weekStart: string): string[] {
  const pool = fixturesInWindow(fixtures, weekStart);
  const official = pool.filter((f) => f.official && !f.played);
  const rest = pool.filter((f) => !official.some((o) => o.id === f.id) && !f.played);
  const fallback = pool.filter((f) => f.played);
  const ordered = [...official, ...rest, ...fallback];
  const picked: string[] = [];
  const seenTeams = new Set<string>();
  // First pass: diversify teams
  for (const f of ordered) {
    if (picked.length >= PREDICTION_SLOT_COUNT) break;
    if (seenTeams.has(f.homeTeamId) || seenTeams.has(f.awayTeamId)) continue;
    picked.push(f.id);
    seenTeams.add(f.homeTeamId);
    seenTeams.add(f.awayTeamId);
  }
  // Fill remaining
  for (const f of ordered) {
    if (picked.length >= PREDICTION_SLOT_COUNT) break;
    if (picked.includes(f.id)) continue;
    picked.push(f.id);
  }
  return picked;
}

export function emptyPicks(fixtureIds: string[]): PredictionPick[] {
  return fixtureIds.map((fixtureId) => ({ fixtureId, home: 0, away: 0, locked: false }));
}

export function ensurePredictionWeek(
  state: PredictionsState,
  fixtures: FixtureRecord[],
  asOf = todayIso(),
  weekStartOverride?: string,
): PredictionsState {
  const liveStart = predictionWeekStart(asOf);
  const weekStart = weekStartOverride ?? liveStart;
  // Only auto-fill current / next week slates.
  const maxStart = maxPredictionWeekStart(asOf);
  if (weekStart > maxStart) {
    return { ...state, totalPoints: state.weeks.reduce((s, w) => s + (w.scored ? w.weekPoints : 0), 0) };
  }

  let weeks = [...state.weeks];
  let week = weeks.find((w) => w.weekStart === weekStart);

  if (!week) {
    week = {
      weekStart,
      fixtureIds: [],
      adminSet: false,
      picks: [],
      scored: false,
      weekPoints: 0,
    };
    weeks.push(week);
  }

  const mayAuto =
    (weekStart === liveStart || weekStart === maxStart) &&
    week.fixtureIds.length < PREDICTION_SLOT_COUNT &&
    shouldAutoSelectWeek(week, weekStart, asOf);

  if (mayAuto) {
    const ids = autoSelectPredictionFixtures(fixtures, weekStart);
    week = {
      ...week,
      fixtureIds: ids,
      adminSet: false,
      picks: mergePicks(week.picks, ids),
    };
    weeks = weeks.map((w) => (w.weekStart === weekStart ? week! : w));
  }

  weeks = scoreCompletedWeeks(weeks, fixtures);
  const totalPoints = weeks.reduce((s, w) => s + (w.scored ? w.weekPoints : 0), 0);
  return { weeks, totalPoints };
}

function mergePicks(existing: PredictionPick[], fixtureIds: string[]): PredictionPick[] {
  return fixtureIds.map((fixtureId) => {
    const hit = existing.find((p) => p.fixtureId === fixtureId);
    return hit
      ? { ...hit, home: clampScore(hit.home), away: clampScore(hit.away) }
      : { fixtureId, home: 0, away: 0, locked: false };
  });
}

export function setAdminPredictionFixtures(
  state: PredictionsState,
  weekStart: string,
  fixtureIds: string[],
): PredictionsState {
  const ids = [...new Set(fixtureIds)].slice(0, PREDICTION_SLOT_COUNT);
  let weeks = [...state.weeks];
  const idx = weeks.findIndex((w) => w.weekStart === weekStart);
  const prev = idx >= 0 ? weeks[idx]! : null;
  const next: PredictionWeek = {
    weekStart,
    fixtureIds: ids,
    adminSet: true,
    picks: mergePicks(prev?.picks ?? [], ids),
    scored: false,
    weekPoints: 0,
  };
  if (idx >= 0) weeks[idx] = next;
  else weeks.push(next);
  weeks = scoreCompletedWeeks(weeks, []); // keep other weeks; rescoring needs fixtures — caller should re-ensure
  const totalPoints = weeks.reduce((s, w) => s + (w.scored ? w.weekPoints : 0), 0);
  return { weeks, totalPoints };
}

export function updatePredictionPick(
  state: PredictionsState,
  weekStart: string,
  fixtureId: string,
  patch: Partial<Pick<PredictionPick, "home" | "away" | "locked">>,
): PredictionsState {
  const weeks = state.weeks.map((w) => {
    if (w.weekStart !== weekStart) return w;
    const picks = w.picks.map((p) => {
      if (p.fixtureId !== fixtureId) return p;
      if (p.locked && patch.locked !== false && (patch.home !== undefined || patch.away !== undefined)) return p;
      return {
        ...p,
        home: patch.home !== undefined ? clampScore(patch.home) : p.home,
        away: patch.away !== undefined ? clampScore(patch.away) : p.away,
        locked: patch.locked !== undefined ? patch.locked : p.locked,
      };
    });
    return { ...w, picks, scored: false, weekPoints: 0 };
  });
  return { weeks, totalPoints: weeks.reduce((s, w) => s + (w.scored ? w.weekPoints : 0), 0) };
}

export function scoreCompletedWeeks(weeks: PredictionWeek[], fixtures: FixtureRecord[]): PredictionWeek[] {
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  return weeks.map((w) => {
    if (!w.fixtureIds.length) return w;
    const results = w.fixtureIds.map((id) => byId.get(id));
    const allPlayed = results.every(
      (f) => f && f.played && f.homeScore !== undefined && f.awayScore !== undefined,
    );
    if (!allPlayed) {
      // Partial: don't mark scored yet, but allow live tally when opening UI
      return w.scored ? w : w;
    }
    let weekPoints = 0;
    for (const pick of w.picks) {
      const f = byId.get(pick.fixtureId);
      if (!f || f.homeScore === undefined || f.awayScore === undefined) continue;
      weekPoints += scorePrediction(pick.home, pick.away, f.homeScore, f.awayScore);
    }
    return { ...w, scored: true, weekPoints };
  });
}

/** Live points for a week (including partial results). */
export function liveWeekPoints(week: PredictionWeek, fixtures: FixtureRecord[]): number {
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  let pts = 0;
  for (const pick of week.picks) {
    const f = byId.get(pick.fixtureId);
    if (!f?.played || f.homeScore === undefined || f.awayScore === undefined) continue;
    pts += scorePrediction(pick.home, pick.away, f.homeScore, f.awayScore);
  }
  return pts;
}

export function currentPredictionWeek(state: PredictionsState, asOf = todayIso()): PredictionWeek | undefined {
  const start = predictionWeekStart(asOf);
  return state.weeks.find((w) => w.weekStart === start);
}

export function predictionFixtureIdSet(state: PredictionsState, _asOf = todayIso()): Set<string> {
  return new Set(state.weeks.flatMap((w) => w.fixtureIds));
}

export function weekByStart(state: PredictionsState, weekStart: string): PredictionWeek | undefined {
  return state.weeks.find((w) => w.weekStart === weekStart);
}
