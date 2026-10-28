import type { GameDatabase } from "../core/Database";
import type { FixtureRecord } from "../data/schema";
import { todayIso } from "../data/leagueSchedule";
import {
  PREDICTION_SCORE_MAX,
  PREDICTION_SLOT_COUNT,
  clampPredictionViewWeek,
  fixturesInWindow,
  liveWeekPoints,
  maxPredictionWeekStart,
  minPredictionWeekStart,
  predictionWeekEnd,
  predictionWeekStart,
  shiftPredictionWeek,
  weekByStart,
  type PredictionPick,
  type PredictionsState,
} from "../football/predictions/Predictions";

export type PredictionsViewMode = "predict" | "admin";

export function predictionsPanelHtml(
  db: GameDatabase,
  state: PredictionsState,
  mode: PredictionsViewMode,
  viewWeekStart: string,
  asOf = todayIso(),
  adminDraft?: Set<string>,
): string {
  const weekStart = clampPredictionViewWeek(viewWeekStart, state, asOf);
  const week = weekByStart(state, weekStart);
  const weekEnd = predictionWeekEnd(weekStart);
  const live = week ? liveWeekPoints(week, db.fixtures) : 0;
  const minWeek = minPredictionWeekStart(state, asOf);
  const maxWeek = maxPredictionWeekStart(asOf);
  const canPrev = weekStart > minWeek;
  const canNext = weekStart < maxWeek;

  if (mode === "admin") {
    const selected = adminDraft ?? new Set(week?.fixtureIds ?? []);
    return adminPanelHtml(db, selected, weekStart, weekEnd, state.totalPoints, canPrev, canNext);
  }

  const rows =
    week?.fixtureIds.length
      ? week.fixtureIds
          .map((id) => {
            const fixture = db.fixtures.find((f) => f.id === id);
            const pick = week.picks.find((p) => p.fixtureId === id);
            return predictionRowHtml(fixture, pick, db);
          })
          .join("")
      : `<p class="hint pred-empty">No prediction slate yet. An admin can set ten matches, or they auto-select from Friday.</p>`;

  return `
    <div class="panel-head pred-panel-head">
      <button type="button" data-act="panel-back">Back</button>
      <p class="pred-rules">Exact score 5 · each correct team goals 1 · correct result 1. Lock a line when ready.</p>
      <button type="button" class="pred-admin-btn" data-pred="admin">Admin</button>
    </div>
    ${weekNavHtml(weekStart, weekEnd, canPrev, canNext, live, state.totalPoints)}
    <div class="pred-list">${rows}</div>
  `;
}

function weekNavHtml(
  weekStart: string,
  weekEnd: string,
  canPrev: boolean,
  canNext: boolean,
  live: number,
  totalPoints: number,
): string {
  return `
    <div class="pred-week-nav">
      <button type="button" data-pred="week-prev" ${canPrev ? "" : "disabled"} aria-label="Previous week">‹</button>
      <div class="pred-week-label">
        <strong>${formatShortDate(weekStart)} – ${formatShortDate(weekEnd)}</strong>
        <span class="pred-points">Week ${live} · Total <strong>${totalPoints}</strong></span>
      </div>
      <button type="button" data-pred="week-next" ${canNext ? "" : "disabled"} aria-label="Next week">›</button>
    </div>
  `;
}

function adminPanelHtml(
  db: GameDatabase,
  selected: Set<string>,
  weekStart: string,
  weekEnd: string,
  totalPoints: number,
  canPrev: boolean,
  canNext: boolean,
): string {
  const pool = fixturesInWindow(db.fixtures, weekStart);
  const list =
    pool
      .map((f) => {
        const home = teamLabel(db, f.homeTeamId);
        const away = teamLabel(db, f.awayTeamId);
        const on = selected.has(f.id);
        return `<label class="pred-admin-row ${on ? "on" : ""}">
          <input type="checkbox" data-pred-pick="${escapeHtml(f.id)}" ${on ? "checked" : ""} ${selected.size >= PREDICTION_SLOT_COUNT && !on ? "disabled" : ""}/>
          <span class="pred-admin-date">${formatShortDate(f.date)}</span>
          <span class="pred-admin-comp">${escapeHtml(f.competition)}</span>
          <span class="pred-admin-match"><span class="pred-team" style="${teamNameStyle(home)}">${escapeHtml(home)}</span> v <span class="pred-team" style="${teamNameStyle(away)}">${escapeHtml(away)}</span></span>
        </label>`;
      })
      .join("") || `<p class="hint">No league fixtures in this Sat–Thu window.</p>`;

  return `
    <div class="panel-head">
      <button type="button" data-pred="admin-back">Back</button>
      <h2>Prediction Admin</h2>
    </div>
    ${weekNavHtml(weekStart, weekEnd, canPrev, canNext, selected.size, totalPoints)}
    <p class="hint pred-rules">Choose or re-set the gold prediction matches for this week. Password gate comes later.</p>
    <div class="pred-admin-actions">
      <button type="button" data-pred="admin-save" ${selected.size === 0 ? "disabled" : ""}>Save slate</button>
      <button type="button" data-pred="admin-clear">Clear / re-set</button>
      <button type="button" data-pred="admin-auto">Auto-select</button>
    </div>
    <div class="pred-admin-list">${list}</div>
  `;
}

function predictionRowHtml(
  fixture: FixtureRecord | undefined,
  pick: PredictionPick | undefined,
  db: GameDatabase,
): string {
  if (!fixture || !pick) {
    return `<div class="pred-row empty"><span class="hint">Missing fixture</span></div>`;
  }
  const home = teamLabel(db, fixture.homeTeamId);
  const away = teamLabel(db, fixture.awayTeamId);
  const locked = pick.locked;
  const played = fixture.played && fixture.homeScore !== undefined && fixture.awayScore !== undefined;
  const actual = played ? `<span class="pred-actual">${fixture.homeScore}–${fixture.awayScore}</span>` : "";
  return `
    <div class="pred-row ${locked ? "locked" : ""} ${played ? "played" : ""}" data-fixture="${escapeHtml(fixture.id)}">
      <div class="pred-row-match">
        <span class="pred-team home" style="${teamNameStyle(home)}">${escapeHtml(home)}</span>
        <div class="pred-scores">
          ${scoreSpinHtml(fixture.id, "home", pick.home, locked || !!played)}
          <span class="pred-score-sep">–</span>
          ${scoreSpinHtml(fixture.id, "away", pick.away, locked || !!played)}
        </div>
        <span class="pred-team away" style="${teamNameStyle(away)}">${escapeHtml(away)}</span>
        ${actual}
      </div>
      <button type="button" class="pred-lock ${locked ? "on" : ""}" data-pred="lock" data-fixture="${escapeHtml(fixture.id)}" aria-label="${locked ? "Unlock" : "Lock"} prediction" title="${locked ? "Unlock" : "Lock"}" ${played ? "disabled" : ""}>${locked ? "locked" : "lock"}</button>
    </div>
  `;
}

function teamLabel(db: GameDatabase, teamId: string): string {
  const t = db.teams.get(teamId);
  return t?.name || t?.abbreviation || teamId;
}

/** Shrink long club names so the prediction row stays on one line. */
export function teamNameStyle(name: string): string {
  const len = name.length;
  const size = len > 20 ? 9 : len > 16 ? 10 : len > 12 ? 11 : 12;
  return `font-size:${size}px`;
}

function scoreSpinHtml(fixtureId: string, side: "home" | "away", value: number, disabled: boolean): string {
  const v = Math.min(PREDICTION_SCORE_MAX, Math.max(0, value));
  const prev = (v + PREDICTION_SCORE_MAX) % (PREDICTION_SCORE_MAX + 1);
  const next = (v + 1) % (PREDICTION_SCORE_MAX + 1);
  return `<span class="time-spin pred-spin ${disabled ? "disabled" : ""}" data-pred-spin="${escapeHtml(fixtureId)}" data-side="${side}" tabindex="${disabled ? -1 : 0}" role="button" aria-label="${side} goals ${v}">
    <span class="spin-ghost">${prev}</span>
    <strong>${v}</strong>
    <span class="spin-ghost">${next}</span>
  </span>`;
}

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export { shiftPredictionWeek, predictionWeekStart };
